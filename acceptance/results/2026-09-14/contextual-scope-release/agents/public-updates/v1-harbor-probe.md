# Harbor local probe evidence

The probe ran from `/tmp/repo-standards-source-xL9AFg` against the reviewed
`service/server.py` with `PORT=18765`. It started the Python process, waited for
`GET /health`, sent one `POST /accept`, checked an unknown path, stopped the
process, restarted it with the same port, and queried health again.

Observed output:

```text
health_before={"status": "ok", "accepted": 0}
accept_status=204
health_after={"status": "ok", "accepted": 1}
unknown_status=404
health_after_restart={"status": "ok", "accepted": 0}
```

This supports the documented local listening endpoint, probe response, accepted
counter behavior, unknown-path response, and loss of the in-memory count across
a clean process restart. It does not establish deployment, external reachability,
or recovery of lost data. No project file changed during the probe.
