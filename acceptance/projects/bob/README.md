# Parcel Queue

Bob's batch tool previews parcel dispatches for the warehouse shift.
It reads newline-delimited JSON from a file, skips already dispatched parcels
and prints dispatch records to stdout. It does not contact a carrier or persist
new dispatch state. Employer review rules are in CONTRIBUTING.md.

Run it with Node. Input examples live under test/.
