// Copies the app's data from a MongoDB database into Firebase's database (Firestore), in the layout the app uses
// (see src/app/api/store.ts). Used by "npm run dev:local" to fill the test copy, and on launch day to move the real
// data. It only READS from MongoDB.

// What is copied, and how each record is named in Firestore. (The old "users" list of Google sign-ins is not copied:
// logins are now kept by Firebase, and admins give everyone a login on the Team page.)
const COLLECTIONS = {
  appData: (doc) => String(doc._id),
  logs: (doc) => String(doc._id),
  meetings: (doc) => String(doc._id),
  meetingAbsences: (doc) => String(doc._id),
};

// MongoDB's own types (record ids, numbers stored in special forms) become plain values; dates stay dates.
function plain(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return value.toHexString();
    if (value._bsontype === 'Long' || value._bsontype === 'Int32' || value._bsontype === 'Double') return Number(value.toString());
    if (value._bsontype === 'Decimal128') return Number(value.toString());
    const out = {};
    for (const [key, inner] of Object.entries(value)) if (inner !== undefined) out[key] = plain(inner);
    return out;
  }
  return value;
}

// Copies every collection; returns { name: count }. Records already in Firestore with the same name are replaced.
// `log` gets one line per collection.
async function copyMongoToFirestore(mongoDb, firestore, log = () => {}) {
  const counts = {};
  for (const [name, idOf] of Object.entries(COLLECTIONS)) {
    const docs = await mongoDb.collection(name).find({}).toArray();
    const seen = new Set();
    let batch = firestore.batch();
    let inBatch = 0;
    let copied = 0;
    for (const doc of docs) {
      const id = idOf(doc);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const { _id, ...rest } = plain(doc);
      void _id;
      batch.set(firestore.collection(name).doc(id), rest);
      copied++;
      if (++inBatch === 400) {
        await batch.commit();
        batch = firestore.batch();
        inBatch = 0;
      }
    }
    if (inBatch) await batch.commit();
    counts[name] = copied;
    log(`  ${name}: ${copied} copied`);
  }
  return counts;
}

module.exports = { copyMongoToFirestore, COLLECTIONS };
