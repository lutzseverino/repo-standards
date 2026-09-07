import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pendingDispatches } from '../src/dispatch.mjs';

test('only ready parcels produce dispatch previews', () => {
  assert.deepEqual(pendingDispatches([{ id: 'a', status: 'ready' }, { id: 'b', status: 'dispatched' }]), [{ parcelId: 'a', action: 'dispatch' }]);
});
test('a ready parcel needs an identifier', () => {
  assert.throws(() => pendingDispatches([{ status: 'ready' }]), /require an id/);
});
