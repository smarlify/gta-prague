import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {cutLowerYard} from './port-yard.js';
import {attachSnow} from './weather.js';
export function createLandcover(data){
 const g=new THREE.Group(),geometries=[];
 const polygons=data.polygons||data.runs.map(([x,z,w,d])=>[[[x,z],[x+w,z],[x+w,z+d],[x,z+d],[x,z]]]);
 for(const rings of polygons){const shape=new THREE.Shape(rings[0].map(([x,z])=>new THREE.Vector2(x,-z)));for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(ring.map(([x,z])=>new THREE.Vector2(x,-z))));const p=new THREE.ShapeGeometry(shape).toNonIndexed();p.rotateX(-Math.PI/2);p.translate(0,.019,0);geometries.push(p);}
 const mat=new THREE.MeshStandardMaterial({color:'#718164',roughness:1});
 mat.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vPlanting;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPlanting=position;');shader.fragmentShader='varying vec3 vPlanting;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 diffuseColor.rgb*=0.93+0.055*sin(vPlanting.x*0.37)+0.035*cos(vPlanting.z*0.53);
 `);};
 attachSnow(mat);
 cutLowerYard(mat);
 if(geometries.length){const m=new THREE.Mesh(mergeGeometries(geometries),mat);m.receiveShadow=true;g.add(m);geometries.forEach(p=>p.dispose());}
 g.name='Photo-inferred planting ground — rendered geometry, not image tiles';g.userData.polygons=polygons.length;return g;
}
