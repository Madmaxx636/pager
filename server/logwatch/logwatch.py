#!/usr/bin/env python3
"""Pager log watcher: reads the logs and events of every service and keeps only what matters.

It runs on the server itself (so the web service never needs access to Docker). Every error, crash and unhealthy service becomes an
"incident": the lines that came just before it, the line itself, and the lines that followed. The same problem repeating is counted, not
listed again. Warnings are only counted (they are hidden unless asked for). Secrets are removed before anything is kept.

The incidents are written to data/api/logs/incidents.json, which the Pager API serves to the apps (Admin > Logs).
Needs only Python 3 and Docker. Install it with scripts/logwatch.sh --install.
"""
import collections, hashlib, json, os, re, shutil, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
OUT = os.environ.get("PAGER_LOGS_DIR", os.path.join(SERVER, "data", "api", "logs"))
IGNORE_FILE = os.environ.get("PAGER_LOG_IGNORE", os.path.join(SERVER, "data", "logwatch.ignore"))

BEFORE_LINES = 25           # lines of the same service kept from before an error
AFTER_LINES = 15            # lines kept from after it ...
AFTER_SECONDS = 20          # ... or until this many seconds have passed
KEEP_DAYS = 14
KEEP_MAX = 500
LINE_MAX = 300
REPEAT_GAP = 3600           # the same problem coming back after an hour is a new incident, so it shows up again

# Things that are known to be harmless. Your own patterns go in data/logwatch.ignore (one regular expression per line).
DEFAULT_IGNORE = [
    r"terminating connection due to administrator command",            # a database being stopped on purpose
    r"Metric named .* already registered",                              # a cosmetic Synapse bug with many bridges
    r"server delivery receipt envelopes are not yet supported",         # a known limit of the Signal bridge
]

# ---- Secrets never leave this file ------------------------------------------------------------------------------------------------
SECRET_WORDS = re.compile(r"(?i)\b(access_token|as_token|hs_token|login_token|password|passwd|secret|api[_-]?key|authorization|bearer|pickle_key)(\"?[=:\s]+\"?)([^\s\"',;]{6,})")
LONG_OPAQUE = re.compile(r"(?<![$!@#:\w])[A-Za-z0-9+/=_-]{40,}(?!\w)")

BEARER = re.compile(r"(?i)\bBearer\s+[^\s\"',;]{6,}")

def redact(text):
    text = BEARER.sub("Bearer [hidden]", text)
    text = SECRET_WORDS.sub(lambda m: m.group(1) + m.group(2) + "[hidden]", text)
    return LONG_OPAQUE.sub("[hidden]", text)

# ---- What counts as important -----------------------------------------------------------------------------------------------------
CRASH = re.compile(r"(\bFATAL\b|\bFTL\b|\bCRITICAL\b|\bPANIC\b|panic:|Traceback \(most recent call last\)|Segmentation fault|[Uu]nhandled (exception|rejection|error)|out of memory)")
ERROR = re.compile(r"((?:^|\s)ERR(?:\s|:)|\bERROR\b|\[error\]|\"level\":\"error\"|level=error|\bException\b|^Error:|\bUncaught\b)")
WARN = re.compile(r"((?:^|\s)WRN(?:\s|:)|\bWARNING\b|\bWARN\b|\"level\":\"warn)")

def severity(line):
    if CRASH.search(line): return "crash"
    if ERROR.search(line): return "error"
    if WARN.search(line): return "warning"
    return None

def fingerprint(service, line):
    t = re.sub(r"^\S*\d{4}-\d{2}-\d{2}[T ]\S+\s*", "", line)             # a leading date and time
    t = re.sub(r"\[[0-9:. -]+\]", "", t)
    t = re.sub(r"[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}", "ID", t)                # uuids
    t = re.sub(r"[$!@][A-Za-z0-9_+/=:.-]{10,}", "ID", t)                    # event, room and user ids
    t = re.sub(r"\b[A-Za-z0-9+/=_-]{24,}\b", "ID", t)
    t = re.sub(r"\d+", "N", t)
    t = re.sub(r"\s+", " ", t).strip()[:200]
    return hashlib.sha1((service + "|" + t).encode()).hexdigest()[:12]

class Watcher:
    def __init__(self):
        os.makedirs(OUT, exist_ok=True)
        self.lock = threading.RLock()
        self.rings = collections.defaultdict(lambda: collections.deque(maxlen=BEFORE_LINES))
        self.incidents = {}                 # id -> record
        self.open_after = []                # incidents still collecting the lines that follow
        self.last_stop = {}                 # service -> when it was stopped on purpose
        self.dirty = False
        self.ignore = [re.compile(p) for p in DEFAULT_IGNORE]
        self._load_ignore()
        self._load()

    # -- the ignore list and the saved incidents ------------------------------------------------------------------------------------
    def _load_ignore(self):
        try:
            with open(IGNORE_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        try: self.ignore.append(re.compile(line))
                        except re.error: pass
        except OSError:
            pass

    def _load(self):
        try:
            with open(os.path.join(OUT, "incidents.json"), encoding="utf-8") as f: data = json.load(f)
            for r in data.get("incidents", []): self.incidents[r["fp"]] = r
        except (OSError, ValueError, KeyError):
            pass

    def save(self):
        with self.lock:
            if not self.dirty: return
            cutoff = time.time() - KEEP_DAYS * 86400
            for fp in [k for k, r in self.incidents.items() if r["last"] < cutoff]: del self.incidents[fp]
            keep = sorted(self.incidents.values(), key=lambda r: r["last"], reverse=True)[:KEEP_MAX]
            self.incidents = {r["fp"]: r for r in keep}
            doc = {"version": 1, "updated": time.time(), "incidents": keep}
            tmp = os.path.join(OUT, "incidents.json.tmp")
            with open(tmp, "w", encoding="utf-8") as f: json.dump(doc, f)
            os.replace(tmp, os.path.join(OUT, "incidents.json"))
            self.dirty = False

    # -- lines from the services ----------------------------------------------------------------------------------------------------
    def line(self, service, raw):
        text = redact(raw.rstrip("\n"))[:LINE_MAX]
        now = time.time()
        with self.lock:
            # lines that follow an earlier error are its "after"
            for r in list(self.open_after):
                if r["service"] == service and len(r["after"]) < AFTER_LINES: r["after"].append(text); self.dirty = True
                if len(r["after"]) >= AFTER_LINES or now - r["last"] > AFTER_SECONDS: self.open_after.remove(r)
            sev = severity(raw)
            if sev and not any(p.search(raw) for p in self.ignore):
                self._incident(service, sev, text, fingerprint(service, raw), now)
            self.rings[service].append(text)

    def _incident(self, service, sev, text, fp, now, before=None):
        r = self.incidents.get(fp)
        if r and now - r["last"] < REPEAT_GAP:
            r["count"] += 1; r["last"] = now
            if sev == "crash" and r["severity"] != "crash": r["severity"] = "crash"
            self.dirty = True
            return
        # a warning is only counted, with no lines around it
        ctx = [] if sev == "warning" else list(before if before is not None else self.rings[service])
        r = {"id": fp + format(int(now) % 100000, "05d"), "fp": fp, "service": service, "severity": sev, "message": text, "first": now, "last": now, "count": 1,
             "before": ctx, "after": []}
        self.incidents[fp] = r
        if sev != "warning": self.open_after.append(r)
        self.dirty = True

    # -- things that are not log lines ----------------------------------------------------------------------------------------------
    def event(self, service, sev, text):
        with self.lock:
            self._incident(service, sev, redact(text)[:LINE_MAX], fingerprint(service, text), time.time())

    def note_stop(self, service):
        with self.lock: self.last_stop[service] = time.time()

    def stopped_on_purpose(self, service):
        with self.lock: return time.time() - self.last_stop.get(service, 0) < 90

# ---- Where the lines come from --------------------------------------------------------------------------------------------------------
def compose_cmd(*args):
    return ["docker", "compose", *args]

SERVICE_OF = re.compile(r"^([a-z0-9_.-]+?)-\d+\s+\|\s?(.*)$")      # "postgres-1  | the line": docker compose prints the service name and its number

def split_prefix(raw):
    """("postgres", "the line") from a line of `docker compose logs`, or None when it has no service in front."""
    m = SERVICE_OF.match(raw.rstrip("\n"))
    return (m.group(1), m.group(2)) if m else None

def follow_logs(w):
    """Reads `docker compose logs -f` for all services; starts again if it ends."""
    while True:
        try:
            p = subprocess.Popen(compose_cmd("logs", "-f", "--tail", "0", "--no-color"), cwd=SERVER, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
            for raw in p.stdout:
                got = split_prefix(raw)
                if got: w.line(*got)
            p.wait()
        except Exception as e:
            w.event("logwatch", "error", "log reader stopped: %s" % e)
        time.sleep(5)

def follow_events(w):
    """Reads Docker's own events: a service that stopped, was killed, ran out of memory or is not healthy."""
    while True:
        try:
            p = subprocess.Popen(["docker", "events", "--format", "{{json .}}", "--filter", "type=container"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, errors="replace")
            for raw in p.stdout:
                try: e = json.loads(raw)
                except ValueError: continue
                a = e.get("Actor", {}).get("Attributes", {}) or {}
                svc = a.get("com.docker.compose.service") or a.get("name", "?")
                action = e.get("Action", "")
                if action in ("stop", "restart"): w.note_stop(svc)          # (a stop on purpose, so what follows is not a crash)
                if action == "oom": w.event(svc, "crash", "%s ran out of memory and was stopped" % svc)
                elif action == "die":
                    code = a.get("exitCode", "0")
                    if code not in ("0", "143") and not w.stopped_on_purpose(svc): w.event(svc, "crash", "%s stopped by itself (exit code %s)" % (svc, code))
                elif action.startswith("health_status") and "unhealthy" in action: w.event(svc, "error", "%s is not healthy" % svc)
        except Exception as e:
            w.event("logwatch", "error", "event reader stopped: %s" % e)
        time.sleep(5)

def checks(w):
    """Every minute: the server itself (disk, backups)."""
    while True:
        try:
            for mount in {"/", os.path.realpath(os.path.join(SERVER, "data"))}:
                u = shutil.disk_usage(mount); pct = int(u.used * 100 / u.total)
                if pct >= 90: w.event("server", "attention", "Disk is %d%% full (%s). Free some space soon." % (pct, mount))
            newest = 0
            home = os.path.expanduser("~")
            for d in (home, os.path.join(SERVER, "data", "backups")):
                try:
                    for n in os.listdir(d):
                        if n.startswith("pager-backup-"): newest = max(newest, os.path.getmtime(os.path.join(d, n)))
                except OSError: pass
            age = (time.time() - newest) / 86400 if newest else None
            if age is None: w.event("server", "attention", "There is no backup of the server yet.")
            elif age > 1.5: w.event("server", "attention", "The newest backup is %d days old." % int(age))
        except Exception as e:
            w.event("logwatch", "error", "a check failed: %s" % e)
        time.sleep(60)

def main():
    w = Watcher()
    for fn in (follow_logs, follow_events, checks):
        threading.Thread(target=fn, args=(w,), daemon=True).start()
    while True:
        time.sleep(1)
        try: w.save()
        except Exception as e: print("could not save: %s" % e, file=sys.stderr)

if __name__ == "__main__":
    main()
