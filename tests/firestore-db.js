// Test helper: a few MongoDB-style commands (find, findOne, insertOne, insertMany, updateOne, deleteMany,
// countDocuments) on top of the Firestore emulator, so tests can set up and look at the stored data directly.
// Filters match exact values or regular expressions; `_id` is the record's id. Records are read whole and checked
// here, which is fine for the few records a test has.
// The users collection uses the app's own record names (the email in small letters), like src/app/api/store.ts.

function createTestDb(firestore, Timestamp) {
  const idFor = (name, doc) => {
    if (name === 'users' && typeof doc.email === 'string') return encodeURIComponent(doc.email.trim().toLowerCase());
    return doc._id !== undefined ? String(doc._id) : null;
  };
  const fromStore = (snap) => {
    const out = { _id: snap.id };
    for (const [key, value] of Object.entries(snap.data() || {})) out[key] = value instanceof Timestamp ? value.toDate() : value;
    return out;
  };
  const matches = (doc, filter = {}) => Object.entries(filter).every(([key, wanted]) => {
    const value = doc[key];
    if (wanted instanceof RegExp) return typeof value === 'string' && wanted.test(value);
    if (wanted && typeof wanted === 'object' && typeof wanted.$regex === 'string') return typeof value === 'string' && new RegExp(wanted.$regex).test(value);
    if (wanted instanceof Date) return value instanceof Date && value.getTime() === wanted.getTime();
    return JSON.stringify(value) === JSON.stringify(wanted);
  });
  const compareBy = (spec) => (a, b) => {
    for (const [key, direction] of Object.entries(spec)) {
      const x = a[key] instanceof Date ? a[key].getTime() : a[key];
      const y = b[key] instanceof Date ? b[key].getTime() : b[key];
      if (x === y) continue;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return (x < y ? -1 : 1) * (direction < 0 ? -1 : 1);
    }
    return 0;
  };

  function collection(name) {
    const col = firestore.collection(name);
    const all = async () => (await col.get()).docs.map(fromStore);
    const write = async (doc) => {
      const { _id, ...rest } = doc;
      const id = idFor(name, doc);
      const ref = id ? col.doc(id) : col.doc();
      await ref.set(name === 'users' && typeof rest.email === 'string' ? { ...rest, email: rest.email.trim().toLowerCase() } : rest);
      return ref.id;
    };
    return {
      find(filter) {
        let sortSpec = null;
        let max = Infinity;
        const run = async () => {
          let docs = (await all()).filter((d) => matches(d, filter));
          if (sortSpec) docs.sort(compareBy(sortSpec));
          return docs.slice(0, max);
        };
        const cursor = {
          sort(spec) { sortSpec = spec; return cursor; },
          limit(n) { max = n; return cursor; },
          toArray: run,
          async next() { return (await run())[0] || null; },
        };
        return cursor;
      },
      // findOne(filter, { sort: { timestamp: -1 } }) gives the first match in that order.
      async findOne(filter, options = {}) {
        const docs = (await all()).filter((d) => matches(d, filter));
        if (options.sort) docs.sort(compareBy(options.sort));
        return docs[0] || null;
      },
      async countDocuments(filter) {
        return (await all()).filter((d) => matches(d, filter)).length;
      },
      async insertOne(doc) {
        return { insertedId: await write(doc) };
      },
      async insertMany(docs) {
        for (const doc of docs) await write(doc);
        return { insertedCount: docs.length };
      },
      // Supports $set and $inc.
      async updateOne(filter, update) {
        const doc = (await all()).find((d) => matches(d, filter));
        if (!doc) return { matchedCount: 0 };
        const fields = { ...(update.$set || {}) };
        for (const [key, by] of Object.entries(update.$inc || {})) fields[key] = (Number(doc[key]) || 0) + by;
        await col.doc(doc._id).set(fields, { merge: true });
        return { matchedCount: 1 };
      },
      async deleteMany(filter) {
        const docs = (await all()).filter((d) => matches(d, filter));
        await Promise.all(docs.map((d) => col.doc(d._id).delete()));
        return { deletedCount: docs.length };
      },
    };
  }
  return { collection };
}

// Deletes everything stored for one emulator project (each test file uses its own project, see harness.js).
async function clearEmulatorProject(host, projectId) {
  const res = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not clear the test database (${res.status})`);
}

module.exports = { createTestDb, clearEmulatorProject };
