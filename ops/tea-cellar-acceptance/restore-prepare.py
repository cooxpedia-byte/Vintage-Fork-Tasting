"""Decode canonical archive only into a 0700 private workspace; print aggregate metadata."""
from pathlib import Path
import os,subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[4]
PRIVATE=ROOT/'work/acceptance-private'
ARCHIVE=Path('/Users/salarmelli/Documents/Codex/Vintage Fork Private Backups/retirement-2026-10-01-DiOtjP/umrqyhqezzuqdrhaywyv')
PRIVATE.mkdir(mode=0o700,exist_ok=True);os.chmod(PRIVATE,0o700)
TARGET=PRIVATE/'canonical-archive.sql'
with TARGET.open('wb') as out, (PRIVATE/'archive-decode.log').open('wb') as err:
 os.chmod(TARGET,0o600);os.chmod(PRIVATE/'archive-decode.log',0o600)
 subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/pg_restore','--file=-',str(ARCHIVE/'database.dump')],stdout=out,stderr=err,check=True)
meta={'archiveSha256':hashlib.sha256((ARCHIVE/'database.dump').read_bytes()).hexdigest(),'decodedSqlSha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'decodedBytes':TARGET.stat().st_size,'source':'item 1 private canonical archive','productionChanges':False}
(PRIVATE/'restore-source.json').write_text(json.dumps(meta,indent=2)+'\n');os.chmod(PRIVATE/'restore-source.json',0o600)
print(json.dumps(meta))
