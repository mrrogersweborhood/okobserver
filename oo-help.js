window.ooHelpMount=function(){
var root=document.getElementById('ooh');if(!root)return;
var tb=root.querySelector('.ooh-tabs'),tabs=[].slice.call(root.querySelectorAll('.ooh-tab')),panels=[].slice.call(root.querySelectorAll('.ooh-p')),devs=[].slice.call(root.querySelectorAll('.ooh-d'));
var dev=(800>window.innerWidth)?'m':'d',cur=tabs[0].getAttribute('data-k');
function show(){
 root.setAttribute('data-dev',dev);
 tabs.forEach(function(b){b.setAttribute('aria-selected',b.getAttribute('data-k')===cur?'true':'false')});
 devs.forEach(function(b){b.setAttribute('aria-pressed',b.getAttribute('data-d')===dev?'true':'false')});
 panels.forEach(function(p){
  var on=p.id==='ooh-p-'+cur||p.getAttribute('data-with')===cur,v=p.querySelector('video');
  p.hidden=!on;
  if(on){var s=v.getAttribute('data-'+dev);if(v.getAttribute('src')!==s){v.setAttribute('src',s);v.load();}var pr=v.play();if(pr&&pr.catch)pr.catch(function(){});}
  else{v.pause();}
 });
}
tabs.forEach(function(b){b.addEventListener('click',function(){cur=b.getAttribute('data-k');show();try{b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})}catch(e){}})});
devs.forEach(function(b){b.addEventListener('click',function(){dev=b.getAttribute('data-d');show()})});

show();
/* the tab row drifts sideways by itself so readers see it slides; it stops the moment the reader touches it */
var auto=false,raf=0,pos=0,dir=1,last=0,hold=0,seen=false;
function can(){return tb.scrollWidth>tb.clientWidth+8}
function stopAuto(){auto=false;if(raf){cancelAnimationFrame(raf);raf=0}}
function tick(t){
 if(!auto){return}
 var dt=last?Math.min(60,t-last):16;last=t;
 if(hold>0){hold-=dt}else{
  pos+=dir*dt*0.04;var max=tb.scrollWidth-tb.clientWidth;
  if(pos>=max){pos=max;dir=-1;hold=1400}else if(0>=pos){pos=0;dir=1;hold=1400}
  tb.scrollLeft=pos;
 }
 raf=requestAnimationFrame(tick);
}
function startAuto(){
 if(auto||!can()||!seen){return}
 if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){return}
 pos=tb.scrollLeft;last=0;hold=900;auto=true;raf=requestAnimationFrame(tick);
}
['touchstart','pointerdown','mousedown','wheel','keydown','focusin'].forEach(function(ev){tb.addEventListener(ev,stopAuto,{passive:true})});
if('IntersectionObserver' in window){
 new IntersectionObserver(function(en){seen=en[0].isIntersecting;if(seen){startAuto()}else{stopAuto()}},{threshold:0.6}).observe(tb);
}else{seen=true;startAuto()}
window.addEventListener('resize',function(){if(!can()){stopAuto()}});
};
window.ooHelpTest=function(){var b=document.getElementById('ooh-test');if(!b){return}var SS=window.speechSynthesis,U=window.SpeechSynthesisUtterance;if(!SS||!U){b.hidden=true;return}var lab=b.querySelector('span');function num(k){try{return parseFloat(localStorage.getItem(k))||1}catch(e){return 1}}function stop(){try{SS.cancel()}catch(e){}b.classList.remove('on');lab.textContent='Test narration'}b.addEventListener('click',function(){try{SS.cancel()}catch(e){}var nm='';try{nm=localStorage.getItem('ooVoice')||''}catch(e){}var vv=null;if(nm&&!/Android/i.test(navigator.userAgent||'')){(SS.getVoices()||[]).forEach(function(x){if(x.name===nm){vv=x}})}setTimeout(function(){try{var u=new U('This is what the Observer will sound like.');if(vv){u.voice=vv;u.lang=vv.lang}u.pitch=num('ooPitch');u.rate=num('ooRate');u.onend=stop;u.onerror=stop;b.classList.add('on');lab.textContent='Playing\u2026';SS.speak(u)}catch(e){stop()}},120)});document.addEventListener('visibilitychange',function(){if(document.hidden){stop()}});window.addEventListener('hashchange',stop);document.addEventListener('pointerdown',function(e){if(b.classList.contains('on')&&!b.contains(e.target)){stop()}},true);document.addEventListener('keydown',function(e){if(e.key==='Escape'){stop()}});window.addEventListener('pagehide',stop);};