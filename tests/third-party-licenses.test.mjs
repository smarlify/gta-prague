import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const run=file=>spawnSync(process.execPath,[file,'--check'],{encoding:'utf8'});
test('distributed third-party notices match locked runtime dependencies and fonts',()=>{
 const result=run('scripts/third-party-licenses.mjs');
 assert.equal(result.status,0,result.stderr);
 const text=fs.readFileSync('public/THIRD_PARTY_LICENSES.txt','utf8');
 for(const required of ['three.js authors','Alexander Milevski','MAGENTA','SIL International','DM Sans','Manrope','Spectral','Bungee'])assert.ok(text.includes(required),`Missing ${required}`);
});

function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worldhood-notices-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const write=(file,data)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),data);};
 write('scripts/third-party-licenses.mjs',fs.readFileSync('scripts/third-party-licenses.mjs'));
 write('src/main.js',"import earcut from 'earcut';\n");
 const packages={};
 for(const name of ['earcut','vite']){
  packages[`node_modules/${name}`]={version:'1.0.0',integrity:'fixture-integrity'};
  write(`node_modules/${name}/package.json`,JSON.stringify({name,version:'1.0.0',license:'MIT'}));
  write(`node_modules/${name}/${name==='earcut'?'LICENSE':'LICENSE.md'}`,'Fixture copyright and licence\n');
 }
 write('package-lock.json',JSON.stringify({packages}));
 write('public/fonts/example/OFL.txt','Fixture font licence\n');
 return {dir,write,script:path.join(dir,'scripts/third-party-licenses.mjs')};
}
test('notice generation refuses an installed package that differs from the lockfile',t=>{
 const f=fixture(t);
 f.write('node_modules/earcut/package.json',JSON.stringify({name:'earcut',version:'2.0.0',license:'MIT'}));
 const result=run(f.script);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/differs from package-lock.json/);
 assert.equal(fs.existsSync(path.join(f.dir,'public/THIRD_PARTY_LICENSES.txt')),false);
});
test('a newly imported runtime package needs reviewed notices before shipping',t=>{
 const f=fixture(t);
 f.write('src/main.js',"import example from 'unreviewed-library';\n");
 f.write('package-lock.json',JSON.stringify({packages:{'node_modules/unreviewed-library':{version:'1.0.0'}}}));
 const result=run(f.script);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Review and add the licence notice/);
});
