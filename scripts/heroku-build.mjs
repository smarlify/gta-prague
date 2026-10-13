// Heroku runs this after install. Vite is a devDependency, so the production
// install does not include it. Rebuild with dev dependencies, then drop public/
// because Vite has already copied it into dist/. SOURCE_VERSION is set only on
// a Heroku build, so this cannot delete the city data on a laptop.
import {execSync} from 'node:child_process';
import {rmSync} from 'node:fs';

if(!process.env.SOURCE_VERSION){
  console.error('Refusing to run outside a Heroku build.');
  process.exit(1);
}
execSync('npm ci --include=dev',{stdio:'inherit'});
execSync('npm run build',{stdio:'inherit'});
rmSync('public',{recursive:true,force:true});
