import 'dotenv/config';
import mongoose from 'mongoose';

const args = new Set(process.argv.slice(2));
const wipeTarget = args.has('--wipe-target');
const dryRun = args.has('--dry-run');

const sourceUri = process.env.OLD_MONGODB_URI;
const targetUri = process.env.MONGODB_URI;
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);

if (args.has('--help')) {
  console.log('Usage: npm run migrate:data -- [--dry-run] [--wipe-target]');
  console.log('Required env vars: OLD_MONGODB_URI, MONGODB_URI');
  process.exit(0);
}

if (!sourceUri) {
  throw new Error('OLD_MONGODB_URI is missing. Add it to backend/.env before running migration.');
}

if (!targetUri) {
  throw new Error('MONGODB_URI is missing. Add it to backend/.env before running migration.');
}

if (sourceUri === targetUri) {
  throw new Error('OLD_MONGODB_URI and MONGODB_URI are the same. Use different source and target URIs.');
}

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error('MIGRATION_BATCH_SIZE must be a positive integer.');
}

const flushBulk = async (collectionName, targetCollection, ops, stats) => {
  if (ops.length === 0) {
    return;
  }

  const result = await targetCollection.bulkWrite(ops, { ordered: false });
  stats[collectionName].bulkWrites += 1;
  stats[collectionName].matched += result.matchedCount || 0;
  stats[collectionName].modified += result.modifiedCount || 0;
  stats[collectionName].upserted += result.upsertedCount || 0;
  ops.length = 0;
};

const cloneCollection = async (sourceDb, targetDb, collectionName, stats) => {
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);

  if (wipeTarget && !dryRun) {
    try {
      await targetCollection.drop();
      console.log(`Dropped target collection before migrate: ${collectionName}`);
    } catch (error) {
      const notFoundCode = 26;
      if (error.code !== notFoundCode) {
        throw error;
      }
    }
  }

  const sourceCount = await sourceCollection.countDocuments();
  stats[collectionName] = {
    sourceCount,
    processed: 0,
    bulkWrites: 0,
    matched: 0,
    modified: 0,
    upserted: 0,
    targetCount: 0,
  };

  if (dryRun) {
    console.log(`[dry-run] ${collectionName}: ${sourceCount} docs would be migrated`);
    return;
  }

  const cursor = sourceCollection.find({});
  const ops = [];

  for await (const doc of cursor) {
    ops.push({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    });
    stats[collectionName].processed += 1;

    if (ops.length >= batchSize) {
      await flushBulk(collectionName, targetCollection, ops, stats);
    }
  }

  await flushBulk(collectionName, targetCollection, ops, stats);

  const indexes = await sourceCollection.indexes();
  for (const index of indexes) {
    if (index.name === '_id_') {
      continue;
    }

    const { key, name, ns, v, ...options } = index;
    try {
      await targetCollection.createIndex(key, { name, ...options });
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('already exists')) {
        throw error;
      }
    }
  }

  stats[collectionName].targetCount = await targetCollection.countDocuments();
};

const run = async () => {
  let sourceConn;
  let targetConn;

  try {
    console.log('Connecting source cluster...');
    sourceConn = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 30000 }).asPromise();
    console.log(`Source connected: ${sourceConn.host} / ${sourceConn.name}`);

    console.log('Connecting target cluster...');
    targetConn = await mongoose.createConnection(targetUri, { serverSelectionTimeoutMS: 30000 }).asPromise();
    console.log(`Target connected: ${targetConn.host} / ${targetConn.name}`);

    const collections = await sourceConn.db.listCollections({}, { nameOnly: true }).toArray();
    const userCollections = collections
      .map((item) => item.name)
      .filter((name) => !name.startsWith('system.'));

    if (userCollections.length === 0) {
      console.log('No user collections found in source database.');
      return;
    }

    console.log(`Collections found: ${userCollections.length}`);
    const stats = {};

    for (const collectionName of userCollections) {
      console.log(`Migrating collection: ${collectionName}`);
      await cloneCollection(sourceConn.db, targetConn.db, collectionName, stats);
    }

    console.log('Migration summary:');
    let totalSource = 0;
    let totalProcessed = 0;
    let totalTarget = 0;

    for (const [collectionName, collectionStats] of Object.entries(stats)) {
      totalSource += collectionStats.sourceCount;
      totalProcessed += collectionStats.processed;
      totalTarget += collectionStats.targetCount;
      console.log(
        `${collectionName}: source=${collectionStats.sourceCount}, processed=${collectionStats.processed}, target=${collectionStats.targetCount}, upserted=${collectionStats.upserted}, modified=${collectionStats.modified}`
      );
    }

    if (dryRun) {
      console.log(`Dry run complete. Total source docs: ${totalSource}`);
    } else {
      console.log(`Done. totalSource=${totalSource}, totalProcessed=${totalProcessed}, totalTarget=${totalTarget}`);
    }
  } finally {
    if (sourceConn) {
      await sourceConn.close();
    }
    if (targetConn) {
      await targetConn.close();
    }
  }
};

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
