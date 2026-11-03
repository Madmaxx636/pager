import json, os, tempfile, time, unittest

_tmp = tempfile.mkdtemp()
os.environ["PAGER_LOGS_DIR"] = _tmp
os.environ["PAGER_LOG_IGNORE"] = os.path.join(_tmp, "ignore")
import logwatch as lw


def fresh():
    for n in ("incidents.json", "incidents.json.tmp"):
        try: os.remove(os.path.join(_tmp, n))
        except OSError: pass
    return lw.Watcher()


class Importance(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(lw.severity("2026-11-03T04:55:01Z ERR Failed to send MSS event"), "error")
        self.assertEqual(lw.severity("synapse.storage - 840 - ERROR - PUT-1 - boom"), "error")
        self.assertEqual(lw.severity("2026-11-03 FTL Failed to initialize database"), "crash")
        self.assertEqual(lw.severity("Traceback (most recent call last):"), "crash")
        self.assertEqual(lw.severity("synapse - WARNING - Denying new event"), "warning")
        self.assertEqual(lw.severity("2026-11-03 WRN Keepalive timed out"), "warning")
        self.assertIsNone(lw.severity("2026-11-03 INF Access component=provisioning request_uri=/x"))
        self.assertIsNone(lw.severity("the word error inside a normal sentence is not a level"))

    def test_the_same_problem_has_the_same_fingerprint(self):
        a = lw.fingerprint("whatsapp", "2026-11-03T04:55:01.177Z ERR Failed room=!AbCdEfGhIjKlMn:x.org event=$QWERTYUIOPASDFGH count=12")
        b = lw.fingerprint("whatsapp", "2026-11-03T09:10:44.001Z ERR Failed room=!ZyXwVuTsRqPoNm:x.org event=$LKJHGFDSAMNBVCXZ count=7")
        self.assertEqual(a, b)
        self.assertNotEqual(a, lw.fingerprint("signal", "2026-11-03T04:55:01.177Z ERR Failed room=!AbCdEfGhIjKlMn:x.org event=$QWERTYUIOPASDFGH count=12"))
        self.assertNotEqual(a, lw.fingerprint("whatsapp", "2026-11-03T04:55:01Z ERR Something else entirely"))


class Prefix(unittest.TestCase):
    def test_the_service_is_taken_from_the_line_docker_compose_prints(self):
        self.assertEqual(lw.split_prefix("postgres-1  | 2026-11-03 ERROR:  could not serialize"), ("postgres", "2026-11-03 ERROR:  could not serialize"))
        self.assertEqual(lw.split_prefix("whatsapp-1  | hello\n"), ("whatsapp", "hello"))
        self.assertEqual(lw.split_prefix("heisenbridge-1 | x"), ("heisenbridge", "x"))
        self.assertEqual(lw.split_prefix("my-service-2  | y | z"), ("my-service", "y | z"))
        self.assertIsNone(lw.split_prefix("no prefix here"))


class Secrets(unittest.TestCase):
    def test_secrets_are_removed(self):
        t = lw.redact("login with password=hunter2hunter2 and access_token: abcdef123456789 and Authorization: Bearer abcdefghijklmnop")
        for secret in ("hunter2hunter2", "abcdef123456789", "abcdefghijklmnop"): self.assertNotIn(secret, t)
        self.assertIn("[hidden]", t)

    def test_long_opaque_strings_are_removed_but_ids_stay(self):
        key = "A" * 44
        self.assertNotIn(key, lw.redact("pickle " + key))
        room = "!CrKBlx3ZJp1abKtrpk_RUtIVIaM9kWUhN8ZvnNs_8Po"
        event = "$OpBrhlTs_QN_VVsazukcsyjy1hMpmvB8hUnuoVjIpf8"
        self.assertIn(room, lw.redact("room " + room)); self.assertIn(event, lw.redact("event " + event))


class Incidents(unittest.TestCase):
    def test_context_before_and_after_is_kept(self):
        w = fresh()
        for i in range(30): w.line("synapse", "INF step %d" % i)
        w.line("synapse", "ERR something broke")
        for i in range(30): w.line("synapse", "INF later %d" % i)
        (r,) = w.incidents.values()
        self.assertEqual(len(r["before"]), lw.BEFORE_LINES)
        self.assertEqual(r["before"][-1], "INF step 29")
        self.assertEqual(r["after"][0], "INF later 0")
        self.assertEqual(len(r["after"]), lw.AFTER_LINES)

    def test_lines_of_other_services_do_not_mix_in(self):
        w = fresh()
        w.line("signal", "INF signal says hi")
        w.line("whatsapp", "ERR broke")
        w.line("signal", "INF signal again")
        (r,) = w.incidents.values()
        self.assertEqual(r["before"], []); self.assertEqual(r["after"], [])

    def test_repeats_are_counted_not_listed(self):
        w = fresh()
        for i in range(5): w.line("discord", "ERR Failed to send room=!AbCdEfGhIjKlMnOp:x.org attempt %d" % i)
        self.assertEqual(len(w.incidents), 1)
        self.assertEqual(list(w.incidents.values())[0]["count"], 5)

    def test_a_problem_that_comes_back_after_a_long_time_is_new_again(self):
        w = fresh()
        w.line("discord", "ERR same problem")
        (r,) = w.incidents.values(); r["last"] -= lw.REPEAT_GAP + 10
        w.line("discord", "ERR same problem")
        self.assertEqual(list(w.incidents.values())[0]["count"], 1)

    def test_warnings_are_counted_with_no_lines_around_them(self):
        w = fresh()
        w.line("synapse", "INF before"); w.line("synapse", "synapse - WARNING - Denying new event"); w.line("synapse", "INF after")
        (r,) = w.incidents.values()
        self.assertEqual(r["severity"], "warning"); self.assertEqual(r["before"], []); self.assertEqual(r["after"], [])

    def test_known_harmless_messages_are_ignored(self):
        w = fresh()
        w.line("postgres", "FATAL: terminating connection due to administrator command")
        self.assertEqual(len(w.incidents), 0)

    def test_your_own_ignore_list_is_used(self):
        with open(os.environ["PAGER_LOG_IGNORE"], "w") as f: f.write("# mine\nnoisy thing \\d+\n")
        w = fresh()
        w.line("api", "ERR noisy thing 42")
        self.assertEqual(len(w.incidents), 0)
        os.remove(os.environ["PAGER_LOG_IGNORE"])

    def test_secrets_never_reach_the_saved_file(self):
        w = fresh()
        w.line("api", "ERR login failed password=supersecret99 for someone")
        w.save()
        with open(os.path.join(_tmp, "incidents.json"), encoding="utf-8") as f: saved = f.read()
        self.assertNotIn("supersecret99", saved)

    def test_saved_file_has_what_the_api_needs(self):
        w = fresh()
        w.line("api", "ERR boom")
        w.save()
        with open(os.path.join(_tmp, "incidents.json"), encoding="utf-8") as f: doc = json.load(f)
        self.assertEqual(doc["version"], 1)
        r = doc["incidents"][0]
        for k in ("id", "fp", "service", "severity", "message", "first", "last", "count", "before", "after"): self.assertIn(k, r)

    def test_a_stop_on_purpose_is_remembered_for_a_while(self):
        w = fresh()
        self.assertFalse(w.stopped_on_purpose("signal"))
        w.note_stop("signal"); self.assertTrue(w.stopped_on_purpose("signal"))

    def test_old_incidents_are_dropped_when_saving(self):
        w = fresh()
        w.line("api", "ERR old one")
        (r,) = w.incidents.values(); r["last"] -= (lw.KEEP_DAYS + 1) * 86400
        w.dirty = True; w.save()
        self.assertEqual(len(w.incidents), 0)


class Versions(unittest.TestCase):
    def test_waiting_versions(self):
        p = os.path.join(_tmp, "versions.available")
        self.assertEqual(lw.waiting_versions(p), [])
        with open(p, "w") as f: f.write("whatsapp\nsignal\n\n")
        self.assertEqual(lw.waiting_versions(p), ["whatsapp", "signal"])


if __name__ == "__main__":
    unittest.main()
