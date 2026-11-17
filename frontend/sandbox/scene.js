import * as T from '../vendor/three.module.js';
export function mount(canvas,onTile){
  const scene=new T.Scene();scene.background=new T.Color('#191329');scene.fog=new T.Fog('#191329',65,130);
  const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.toneMapping=T.ACESFilmicToneMapping;
  const camera=new T.PerspectiveCamera(48,1,.1,160),target=new T.Vector3(0,0,0);
  scene.add(new T.HemisphereLight('#d1beff','#364956',2));const sun=new T.DirectionalLight('#ffe6ce',3);sun.position.set(12,35,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26});scene.add(sun);
  const geometries=[],mats=new Map();const geom=g=>(geometries.push(g),g),cube=geom(new T.BoxGeometry(1,1,1)),cyl=geom(new T.CylinderGeometry(1,1,1,8)),cone=geom(new T.ConeGeometry(1,1,6)),orb=geom(new T.IcosahedronGeometry(1,0)),ring=geom(new T.TorusGeometry(1,.055,6,40));
  const mat=(color,glow=false)=>{const k=color+glow;if(!mats.has(k))mats.set(k,new T.MeshStandardMaterial({color,roughness:.7,emissive:glow?color:'#000000',emissiveIntensity:glow?1.5:0}));return mats.get(k);};
  function mesh(parent,g,color,x,y,z,sx,sy,sz,glow=false){const m=new T.Mesh(g,mat(color,glow));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(p,c,x,y,z,a,b,d,glow=false)=>mesh(p,cube,c,x,y,z,a,b,d,glow);
  mesh(scene,cyl,'#594666',0,-1.3,0,22,2.5,22);mesh(scene,cyl,'#868678',0,-.08,0,21.5,.4,21.5);
  mesh(scene,cone,'#49364f',0,-4,0,20,5,20).rotation.z=Math.PI;
  for(let i=0;i<25;i++){const a=i*2.39996,r=19+(i%3)*.4,x=Math.sin(a)*r,z=Math.cos(a)*r;mesh(scene,cyl,'#9b8297',x,.7,z,.13,1.4,.13);mesh(scene,cone,i%2?'#889b8f':'#ab93c7',x,2,z,1,2.5,1);}
  for(let i=0;i<15;i++){const a=i*2.4;const rock=mesh(scene,orb,'#6f5780',Math.sin(a)*24,-4-(i%4),Math.cos(a)*24,1.1,1.7,1);rock.rotation.z=a;}
  const water=mesh(scene,cyl,'#312944',0,-9,0,55,.1,55);water.receiveShadow=false;
  const tiles=[],tilesByKey=new Map();
  for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if(x*x+z*z<=21){const tile=box(scene,(x+z)%2?'#879080':'#919783',x*4,.16,z*4,3.85,.12,3.85);tile.userData={x,z};tiles.push(tile);tilesByKey.set(`${x},${z}`,tile);}
  const builds=new T.Group();scene.add(builds);let rotors=[],people=[];
  function rebuild(island){builds.clear();rotors=[];people=[];const active=island.network().active;
    for(const m of island.modules){const g=new T.Group();g.position.set(m.x*4,.25,m.z*4);g.rotation.y=m.rotation*Math.PI/2;builds.add(g);
      const lit=active.has(`${m.x},${m.z}`),accent=lit?'#b99aff':'#605b72',window=lit?'#ffdaa4':'#595568';
      box(g,'#d7ccbf',0,.2,0,3.4,.35,3.4);box(g,accent,0,.4,0,3.1,.08,3.1,lit);
      if(m.kind==='core'||m.kind==='beacon'){
        mesh(g,cyl,'#65536e',0,1,0,1.05,1.3,1.05);mesh(g,orb,accent,0,2.5,0,.7,1,.7,lit);
        for(let i=0;i<3;i++){const r=mesh(g,ring,accent,0,2.5+i*.2,0,1.2+i*.25,1.2+i*.25,1.2+i*.25,lit);r.rotation.x=.8+i*.6;rotors.push(r);}
        if(m.kind==='beacon'&&lit){const beam=mesh(g,cyl,'#b8a1f5',0,7,0,.08,10,.08,true);beam.castShadow=false;}
      }else if(m.kind==='generator'){
        mesh(g,cyl,'#e3daca',0,2.4,0,.2,4,.2);const rotor=new T.Group();rotor.position.y=4.6;g.add(rotor);rotors.push(rotor);
        for(let i=0;i<3;i++){const blade=box(rotor,'#c6b0f0',Math.sin(i*Math.PI*2/3)*.7,Math.cos(i*Math.PI*2/3)*.7,0,.3,2,.16);blade.rotation.z=-i*Math.PI*2/3;}
        box(g,accent,0,.8,.7,1.1,.6,1,true);
      }else if(m.kind==='home'){
        box(g,'#dbcebb',0,1.2,0,2.6,1.8,2.5);box(g,'#967cba',0,2.3,0,3,.4,2.9);box(g,'#67566d',0,1,1.3,.65,1.4,.1);
        for(const x of [-.85,.85])box(g,window,x,1.5,1.28,.6,.6,.06,lit);
        if(lit)for(let i=0;i<2;i++){const p=new T.Group();p.position.set(m.x*4+i*.8,.4,m.z*4+1.8);mesh(p,cyl,'#d4b4ed',0,.45,0,.14,.6,.14);mesh(p,orb,'#efc9a8',0,.95,0,.19,.21,.19);builds.add(p);people.push({object:p,x:p.position.x,z:p.position.z});}
      }else if(m.kind==='garden'){
        box(g,'#6a8475',0,.75,0,2.8,.8,2.8);
        for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){box(g,'#645b4b',i*.8,1.2,j*.8,.6,.15,.6);mesh(g,orb,lit?'#a4c58b':'#6a7964',i*.8,1.5,j*.8,.3,.4,.3);}
        for(const x of [-1.4,1.4])box(g,'#d0c6b6',x,1.8,0,.1,2.6,.1);box(g,'#b5c2b1',0,3.1,0,3.1,.16,3);
      }else if(m.kind==='cable'){
        box(g,'#645b77',0,.65,0,3,.2,.8);box(g,accent,0,.8,0,3,.07,.15,lit);box(g,accent,0,.8,0,.15,.07,3,lit);
      }else{
        box(g,m.kind==='lumber'?'#a89278':'#8693a1',0,1,0,2.6,1.5,2.2);box(g,'#635774',0,2,0,3,.25,2.8);
        for(let i=0;i<3;i++)mesh(g,m.kind==='lumber'?cyl:orb,m.kind==='lumber'?'#c7ab83':accent,i*.7-.7,2.5,0,.3,.5,.3,m.kind==='quarry'&&lit);
        box(g,window,0,1,1.15,1.4,.4,.06,lit);
      }
    }
  }
  let yaw=.7,pitch=.72,distance=49,drag=null,walking=false,walk={x:0,z:12,y:0,vy:0},keys=new Set(),hover=null;
  const preview=new T.Mesh(cube,new T.MeshBasicMaterial({color:'#c7a2ff',wireframe:true,transparent:true,opacity:.8}));preview.scale.set(3.7,2,3.7);scene.add(preview);preview.visible=false;
  const ray=new T.Raycaster();let pointer=new T.Vector2();
  function point(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);hover=ray.intersectObjects(tiles)[0]?.object.userData??null;preview.visible=!!hover;if(hover)preview.position.set(hover.x*4,1.3,hover.z*4);}
  canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=e=>{canvas.focus();drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,id:e.pointerId};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(drag&&(walking||drag.button===2||e.pointerType==='touch')){yaw-=(e.clientX-drag.x)*.006;pitch=Math.max(walking?-.8:.3,Math.min(1.35,pitch+(e.clientY-drag.y)*.006));drag.x=e.clientX;drag.y=e.clientY;}point(e);};
  canvas.onpointerup=e=>{if(drag&&drag.button===0&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<8){point(e);if(hover)onTile(hover);}drag=null;};canvas.onpointercancel=()=>drag=null;
  canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(25,Math.min(70,distance+e.deltaY*.035));},{passive:false});
  const down=e=>{if(e.target.closest?.('button,input,a'))return;const k=e.key.toLowerCase();if(['w','a','s','d',' '].includes(k)){e.preventDefault();keys.add(k);if(k===' '&&walk.y===0&&walk.vy===0)walk.vy=5;}};
  const up=e=>keys.delete(e.key.toLowerCase()),blur=()=>{keys.clear();drag=null;};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
  const resize=()=>{renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.fov=canvas.clientWidth<760?70:48;distance=canvas.clientWidth<760?70:49;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);resize();let last=0,frame;
  function render(time){const dt=Math.min(.04,(time-last)/1000||0);last=time;
    if(walking){const f=Number(keys.has('w'))-Number(keys.has('s')),r=Number(keys.has('d'))-Number(keys.has('a'));let x=walk.x+(-Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*6,z=walk.z+(-Math.cos(yaw)*f-Math.sin(yaw)*r)*dt*6;if(Math.hypot(x,z)<20){walk.x=x;walk.z=z;}walk.vy-=15*dt;walk.y=Math.max(0,walk.y+walk.vy*dt);if(!walk.y)walk.vy=0;camera.position.set(walk.x,2+walk.y,walk.z);camera.rotation.order='YXZ';camera.rotation.set(-pitch,yaw,0);
    }else{camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(target);}
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){rotors.forEach((r,i)=>r.rotation.z+=dt*(i%2?.3:.7));people.forEach((p,i)=>{p.object.position.x=p.x+Math.sin(time*.0006+i)*.5;});}
    renderer.render(scene,camera);frame=requestAnimationFrame(render);
  }frame=requestAnimationFrame(render);
  return {rebuild,setKey(k,held){if(held)keys.add(k);else keys.delete(k);},toggleWalk(){walking=!walking;pitch=walking?.05:.72;yaw=walking?0:.7;keys.clear();canvas.focus();return walking;},dispose(){cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());preview.geometry=null;preview.material.dispose();renderer.dispose();}};
}
