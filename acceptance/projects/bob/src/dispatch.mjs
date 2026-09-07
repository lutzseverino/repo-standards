export function pendingDispatches(parcels) {
  return parcels.filter(parcel => parcel.status === 'ready').map(parcel => {
    if (typeof parcel.id !== 'string' || !parcel.id) throw new Error('Ready parcels require an id');
    return { parcelId: parcel.id, action: 'dispatch' };
  });
}
