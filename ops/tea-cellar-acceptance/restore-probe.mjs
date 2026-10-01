import {createRestoredDatabase} from './restore-loader.mjs';
try{const {db,metadata}=await createRestoredDatabase();console.log(JSON.stringify(metadata));await db.close();}catch{console.error('restore_probe_failed: private diagnostic retained');process.exitCode=1;}
