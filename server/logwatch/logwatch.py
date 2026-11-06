#!/usr/bin/env python3
"""Pager log watcher: reads the logs and events of every service and keeps only what matters.

It runs on the server itself (so the web service never needs access to Docker). Every error, crash and unhealthy service becomes an
"incident": the lines that came just before it, the line itself, and the lines that followed. The same problem repeating is counted, not
listed again. Warnings are only counted (they are hidden unless asked for). Secrets are removed before anything is kept.

The incidents are written to data/api/logs/incidents.json, which the Pager API serves to the apps (Admin > Logs).
Needs only Python 3 and Docker. Install it with scripts/logwatch.sh --install.
"""
import collections, datetime, hashlib, json, os, re, shutil, subprocess, sys, threading, time

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

# ---- Encryption health: do the bridges and the server agree about each device's keys? ------------------------------------------------
def key_mismatches(server_keys, bridge_keys):
    """server_keys: {(user, device): curve25519 key} from Synapse. bridge_keys: [(user, device, curve25519 key)] a bridge has remembered.
    A bridge that remembers a different key for a device than the one the device uploaded encrypts to a key nobody holds: that device sees every message as locked."""
    return sorted({(u, d) for u, d, k in bridge_keys if (u, d) in server_keys and server_keys[(u, d)] != k})

def starved_devices(rows, now, days=7):
    """rows: (user, device, last_seen_ms, one_time_keys, unused_fallback_keys). Devices in use lately that nobody can start a conversation with."""
    return sorted((u, d) for u, d, seen, otk, fb in rows if now - seen < days * 86400 * 1000 and otk == 0 and fb == 0)

def psql(host, db, sql):
    p = subprocess.run(["docker", "compose", "exec", "-T", host, "psql", "-U", "pager", "-d", db, "-At", "-F", "|", "-c", sql],
                       cwd=SERVER, capture_output=True, text=True, timeout=60)
    if p.returncode: raise RuntimeError(p.stderr.strip()[:200] or "psql failed")
    return [l.split("|") for l in p.stdout.splitlines() if l]

def encryption_check(w):
    """Every 15 minutes. Reads the databases (nothing is changed)."""
    server = {(u, d): k for u, d, k in psql("postgres", "synapse",
        "select j.user_id, j.device_id, j.key_json::json->'keys'->>('curve25519:'||j.device_id) from e2e_device_keys_json j join users u on u.name=j.user_id where u.appservice_id is null")}
    now = time.time() * 1000
    rows = []
    for u, d, seen, otk, fb in psql("postgres", "synapse",
        "select d.user_id, d.device_id, coalesce((select max(last_seen) from user_ips i where i.user_id=d.user_id and i.device_id=d.device_id),0), "
        "(select count(*) from e2e_one_time_keys_json o where o.user_id=d.user_id and o.device_id=d.device_id), "
        "(select count(*) from e2e_fallback_keys_json f where f.user_id=d.user_id and f.device_id=d.device_id and not f.used) "
        "from devices d join users u on u.name=d.user_id where u.appservice_id is null"):
        rows.append((u, d, int(seen), int(otk), int(fb)))
    for u, d in starved_devices(rows, now):
        w.event("server", "attention", "Device %s of %s has no encryption keys left to hand out, so new conversations with it cannot be started." % (d, u))
    host = "bridgedb"
    try: dbs = [r[0] for r in psql(host, "postgres", "select datname from pg_database where datname not in ('postgres','template0','template1')")]
    except RuntimeError: host = "postgres"; dbs = [r[0] for r in psql(host, "postgres", "select datname from pg_database where datname not in ('postgres','template0','template1','synapse')")]
    for db in dbs:
        try:
            if not psql(host, db, "select to_regclass('crypto_device')")[0][0]: continue   # this bridge keeps no encryption data (asked first, so the database does not log an error)
            known = [(u, d, k) for u, d, k in psql(host, db, "select user_id, device_id, identity_key from crypto_device where not deleted")]
        except (RuntimeError, IndexError): continue
        for u, d in key_mismatches(server, known):
            w.event("server", "error", "The %s bridge remembers different keys for device %s of %s than the device uploaded: messages from it stay locked on that device." % (db, d, u))

def waiting_versions(path):
    """The names listed in data/versions.available (written weekly by update-bridges.sh), or [] when none."""
    try:
        with open(path, encoding="utf-8") as f: return [n.strip() for n in f if n.strip()]
    except OSError:
        return []

def maintenance_problems(path, now):
    """What to warn about from data/api/maintenance.json (written by scripts/maintenance.sh): failed jobs, or a night that did not run. [] when fine or not installed."""
    try:
        with open(path, encoding="utf-8") as f: doc = json.load(f)
        at = datetime.datetime.fromisoformat(doc["at"]).timestamp()
    except (OSError, ValueError, KeyError): return []
    out = ["Nightly maintenance: %s did not work (%s)." % (t["name"], t.get("note") or "no details") for t in doc.get("tasks", []) if not t.get("ok")]
    if now - at > 3 * 86400: out.append("Nightly maintenance has not run for %d days." % int((now - at) / 86400))
    return out

def maintenance_running(path, now):
    """True when the nightly maintenance has run within the last 3 days (data/api/maintenance.json says when)."""
    try:
        with open(path, encoding="utf-8") as f: at = datetime.datetime.fromisoformat(json.load(f)["at"]).timestamp()
    except (OSError, ValueError, KeyError): return False
    return now - at <= 3 * 86400

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
            for msg in maintenance_problems(os.path.join(SERVER, "data", "api", "maintenance.json"), time.time()): w.event("server", "attention", msg)
            names = waiting_versions(os.path.join(SERVER, "data", "versions.available"))
            # The nightly maintenance installs these by itself; only say so when it is not doing that (never installed, or stopped for days).
            if names and not maintenance_running(os.path.join(SERVER, "data", "api", "maintenance.json"), time.time()):
                w.event("server", "attention", "Newer versions are ready for: %s, and the nightly maintenance is not installing them. Install them with: pager upgrade (Synapse by hand), or switch maintenance on: scripts/maintenance.sh --install." % ", ".join(names))
        except Exception as e:
            w.event("logwatch", "error", "a check failed: %s" % e)
        time.sleep(60)

def every_15_minutes(w):
    time.sleep(30)
    while True:
        try: encryption_check(w)
        except Exception as e: w.event("logwatch", "warning", "the encryption check could not run: %s" % e)
        time.sleep(900)

def main():
    w = Watcher()
    for fn in (follow_logs, follow_events, checks, every_15_minutes):
        threading.Thread(target=fn, args=(w,), daemon=True).start()
    while True:
        time.sleep(1)
        try: w.save()
        except Exception as e: print("could not save: %s" % e, file=sys.stderr)

if __name__ == "__main__":
    main()
