# Relay limitations

The delivery counter is held in process memory and is lost on restart. During a
failed rollout, stop the new process and restart the last reviewed revision.
Production deployment access is not available from a local checkout.
