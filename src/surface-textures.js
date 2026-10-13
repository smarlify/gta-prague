import * as THREE from 'three';

// Poly Haven CC0 albedos and a tiny flake noise (see public/textures/sources.json).
// World-metre UVs: setWorldMetreUVs, then texture.repeat = 1 / TILE_M.

export const SURFACE_TILE_M=1;

const placeholder=(()=>{
 const t=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
 t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;return t;
})();

export const ASPHALT_UNIFORM={value:placeholder};
export const ASPHALT_SCALE_UNIFORM={value:1/SURFACE_TILE_M};
export const PAINT_FLAKE_UNIFORM={value:placeholder};
export const PAINT_FLAKE_SCALE_UNIFORM={value:14};

function prep(tex,{srgb=false,anisotropy=8}={}){
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 tex.anisotropy=anisotropy;
 tex.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
 tex.needsUpdate=true;
 return tex;
}

export async function loadSurfaceTextures({anisotropy=8}={}){
 const loader=new THREE.TextureLoader();
 const [asphalt,ground,flake]=await Promise.all([
  loader.loadAsync('/textures/asphalt_02_diff_1k.jpg'),
  loader.loadAsync('/textures/grass_ground_diff_1k.jpg'),
  loader.loadAsync('/textures/paint_flake_256.jpg'),
 ]);
 prep(asphalt,{srgb:true,anisotropy});
 prep(ground,{srgb:true,anisotropy});
 prep(flake,{srgb:false,anisotropy});
 asphalt.repeat.set(1/SURFACE_TILE_M,1/SURFACE_TILE_M);
 ground.repeat.set(1/SURFACE_TILE_M,1/SURFACE_TILE_M);
 flake.repeat.set(1,1);
 ASPHALT_UNIFORM.value=asphalt;
 PAINT_FLAKE_UNIFORM.value=flake;
 return {asphalt,ground,flake};
}

// UVs in world metres from positions (x,z) or plane-style (x,y) before a −90° X rotation.
export function setWorldMetreUVs(geometry,{plane=false}={}){
 const pos=geometry.attributes.position;if(!pos)return geometry;
 const uv=new Float32Array(pos.count*2);
 for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i);uv[i*2+1]=plane?pos.getY(i):pos.getZ(i);}
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 return geometry;
}

export function applyGroundTexture(material,groundTex){
 material.map=groundTex;
 material.color.set('#94988b');
 material.needsUpdate=true;
}
