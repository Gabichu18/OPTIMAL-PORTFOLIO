// ===== Frontier Lab engine v3: 15y data, Black-Litterman, Ledoit-Wolf, risk parity, resampling, walk-forward =====
const META={NVDA:['Nvidia','NVDA','semi'],AMZN:['Amazon','AMZN','tech'],GOOGL:['Alphabet','GOOGL','tech'],MSFT:['Microsoft','MSFT','tech'],META:['Meta Platforms','META','tech'],AAPL:['Apple','AAPL','tech'],VRT:['Vertiv','VRT','power'],VST:['Vistra','VST','power'],ETN:['Eaton','ETN','power'],ANET:['Arista Networks','ANET','semi'],MU:['Micron','MU','semi'],TSM:['TSMC','TSM','semi'],XIAOMI:['Xiaomi','1810.HK','tech'],AMAT:['Applied Materials','AMAT','semi'],SAMSUNG:['Samsung Electronics','005930.KS','semi'],CAT:['Caterpillar','CAT','power'],AVGO:['Broadcom','AVGO','semi'],CRWD:['CrowdStrike','CRWD','tech'],JPM:['JPMorgan Chase','JPM','fin'],GS:['Goldman Sachs','GS','fin'],LMT:['Lockheed Martin','LMT','def'],NUE:['Nucor','NUE','power'],TM:['Toyota','TM','def'],PFE:['Pfizer','PFE','def'],ITX:['Inditex','ITX.MC','def'],ASML:['ASML','ASML','semi'],SKHYNIX:['SK Hynix','000660.KS','semi'],GOLD:['Gold','GC=F','cmdty'],COPX:['Global X Copper Miners','4COP.DE / COPX','cmdty'],ENERGY:['Global energy ETF','XDW0 · MSCI World Energy','cmdty'],BTC:['Bitcoin','BTC-USD','crypto'],UST:['US Treasuries 7–10y','IEF','bond'],FER:['Ferrovial','FER.MC','power'],IBE:['Iberdrola','IBE.MC','power'],COST:['Costco','COST','def']};
const mean=a=>{let s=0;for(const x of a)s+=x;return s/a.length;};
function parseData(txt){const L=txt.trim().split('\n');const [start,Ts]=L[0].split('|');const T=+Ts;const ids=[],R=[];let mkt=null,rfm=null,eurx=null,rfe=null;
  for(const l of L.slice(1)){const [id,s,v]=l.split('|');const arr=new Array(T).fill(null);v.split(',').forEach((x,k)=>{if(x!=='')arr[+s+k]=(+x)/1e4;});if(id==='SPY')mkt=arr;else if(id==='RF')rfm=arr;else if(id==='EURX5')eurx=arr.map(x=>x==null?null:x/10);else if(id==='RFEUR')rfe=arr;else{ids.push(id);R.push(arr);}}
  const months=[];let [y,m]=start.split('-').map(Number);for(let t=0;t<T;t++){months.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}
  return {ids,R,mkt,rfm:rfm||new Array(T).fill(0),eurx,rfe,months,T};}
// base currency: 'usd' as downloaded; 'eur' = unhedged, converted at month-end EUR/USD; 'eurh' = hedged to EUR monthly (return minus the USD-EUR short-rate gap); 'eurb' = unhedged except Treasuries
function toBase(H,cur){if(cur==='usd'||!H.eurx)return H;const T=H.T,fx=H.eurx,ru=H.rfm,re=H.rfe;
  const un=(x,t)=>x==null?null:(1+x)/(1+fx[t])-1,hd=(x,t)=>x==null?null:x-ru[t]+re[t];
  const pick=id=>cur==='eurh'||(cur==='eurb'&&id==='UST')?hd:un;// 'eurb': only the bond hedged
  return {...H,R:H.R.map((r,i)=>r.map(pick(H.ids[i]))),mkt:H.mkt.map(cur==='eurh'?hd:un),rfm:re.slice(),cur};}
// drop a block of months (e.g. the 2008-09 crisis) from the estimation history
function dropMonths(H,from,to){const keep=H.months.map((m,t)=>m<from||m>to?t:-1).filter(t=>t>=0);const pick=a=>keep.map(t=>a[t]);
  return {...H,R:H.R.map(pick),mkt:pick(H.mkt),rfm:pick(H.rfm),months:pick(H.months),T:keep.length,dropped:[from,to]};}
function sliceH(H,n){const a=Math.max(0,H.T-n);return {ids:H.ids,R:H.R.map(r=>r.slice(a)),mkt:H.mkt.slice(a),rfm:H.rfm.slice(a),months:H.months.slice(a),T:H.T-a,cur:H.cur};}
function matVec(S,w){const n=w.length,o=new Float64Array(n);for(let i=0;i<n;i++){let s=0;const r=S[i];for(let j=0;j<n;j++)s+=r[j]*w[j];o[i]=s;}return o;}
function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function stats(w,mu,S){const v=dot(w,matVec(S,w));return {ret:dot(w,mu),vol:Math.sqrt(Math.max(v,0))};}
function jacobiEig(A0){const n=A0.length,A=A0.map(r=>Float64Array.from(r)),V=[];for(let i=0;i<n;i++){V.push(new Float64Array(n));V[i][i]=1;}
  for(let sw=0;sw<60;sw++){let off=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)off+=A[i][j]*A[i][j];if(off<1e-18)break;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){if(Math.abs(A[p][q])<1e-14)continue;const th=(A[q][q]-A[p][p])/(2*A[p][q]);const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1));const c=1/Math.sqrt(t*t+1),s=t*c;
      for(let k=0;k<n;k++){const akp=A[k][p],akq=A[k][q];A[k][p]=c*akp-s*akq;A[k][q]=s*akp+c*akq;}
      for(let k=0;k<n;k++){const apk=A[p][k],aqk=A[q][k];A[p][k]=c*apk-s*aqk;A[q][k]=s*apk+c*aqk;}
      for(let k=0;k<n;k++){const vkp=V[k][p],vkq=V[k][q];V[k][p]=c*vkp-s*vkq;V[k][q]=s*vkp+c*vkq;}}}
  return {vals:A.map((r,i)=>r[i]),V};}
function psdCorr(C){const n=C.length,{vals,V}=jacobiEig(C);if(Math.min(...vals)>1e-4)return C;const l=vals.map(v=>Math.max(v,1e-4));const B=[];
  for(let i=0;i<n;i++){B.push(new Float64Array(n));for(let j=0;j<n;j++){let s=0;for(let k=0;k<n;k++)s+=V[i][k]*l[k]*V[j][k];B[i][j]=s;}}
  const d=B.map((r,i)=>Math.sqrt(r[i]));for(let i=0;i<n;i++)for(let j=0;j<n;j++)B[i][j]/=d[i]*d[j];return B;}
function invSmall(M){const n=M.length,A=M.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>i===j?1:0)]);
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];const d=A[c][c]||1e-12;for(let k=0;k<2*n;k++)A[c][k]/=d;
    for(let r=0;r<n;r++){if(r===c)continue;const f=A[r][c];if(!f)continue;for(let k=0;k<2*n;k++)A[r][k]-=f*A[c][k];}}return A.map(r=>r.slice(n));}
// Ledoit-Wolf (2003) optimal intensity toward constant correlation, on months where every asset has data
function ledoitWolf(H){const N=H.ids.length,idx=[];for(let t=0;t<H.T;t++)if(H.R.every(r=>r[t]!=null))idx.push(t);const T=idx.length;if(T<24)return {delta:.3,T};
  const X=H.R.map(r=>{const v=idx.map(t=>r[t]);const m=mean(v);return v.map(x=>x-m);});const S=[];for(let i=0;i<N;i++){S.push(new Float64Array(N));for(let j=0;j<N;j++)S[i][j]=dot(X[i],X[j])/T;}
  let rb=0;for(let i=0;i<N;i++)for(let j=i+1;j<N;j++)rb+=S[i][j]/Math.sqrt(S[i][i]*S[j][j]);rb/=N*(N-1)/2;
  let pi=0,rho=0,gam=0;const Y2=X.map(x=>x.map(v=>v*v));
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){let pij=0,tii=0,tjj=0;for(let t=0;t<T;t++){const e=X[i][t]*X[j][t]-S[i][j];pij+=e*e;tii+=(Y2[i][t]-S[i][i])*e;tjj+=(Y2[j][t]-S[j][j])*e;}pij/=T;tii/=T;tjj/=T;pi+=pij;
    if(i===j)rho+=pij;else{rho+=rb/2*(Math.sqrt(S[j][j]/S[i][i])*tii+Math.sqrt(S[i][i]/S[j][j])*tjj);const f=rb*Math.sqrt(S[i][i]*S[j][j]);gam+=(f-S[i][j])**2;}}
  return {delta:Math.max(0,Math.min(1,(pi-rho)/gam/T)),T};}
function blackLitterman(pi,S,views,tau,ids){const K=views.length;if(!K)return Array.from(pi);const n=pi.length;
  const P=views.map(v=>{const p=new Float64Array(n);p[ids.indexOf(v.a)]=1;if(v.type==='rel')p[ids.indexOf(v.b)]-=1;return p;});
  const tSP=P.map(p=>matVec(S,p).map(x=>x*tau));// tau*S*p_k
  const M=P.map((p,k)=>P.map((q,l)=>dot(q,tSP[k])));// P tauS P'
  // Omega: user views diagonal (Idzorek-style); history views share one block proportional to tau*S, so confidence c moves the prior exactly c of the way
  views.forEach((v,k)=>{const c=Math.min(.999,Math.max(.001,v.conf)),f=1/c-1;
    if(v.hist)views.forEach((u,l)=>{if(u.hist)M[k][l]+=f*dot(P[l],tSP[k]);});else M[k][k]+=f*dot(P[k],tSP[k]);});
  const Mi=invSmall(M);const diff=views.map((v,k)=>v.q-dot(P[k],pi));const z=Mi.map(r=>dot(r,diff));
  return Array.from(pi,(x,i)=>x+z.reduce((s,zk,k)=>s+zk*tSP[k][i],0));}
function buildModel(H,o){
  const n=H.ids.length,T=H.T,rf=o.rf,erp=o.erp,m=H.mkt,mm=mean(m);let vm=0;for(const x of m)vm+=(x-mm)**2;vm/=T-1;
  const hm=[],hmAdj=[],sd=[],beta=[],cagr=[],nObs=[],first=[];
  H.R.forEach(r=>{const idx=[];r.forEach((x,t)=>{if(x!=null)idx.push(t);});const v=idx.map(t=>r[t]);const mu=mean(v),mx=mean(idx.map(t=>m[t]));let s2=0,c=0,vx=0,g=1;
    idx.forEach(t=>{s2+=(r[t]-mu)**2;c+=(r[t]-mu)*(m[t]-mx);vx+=(m[t]-mx)**2;g*=1+r[t];});
    hmAdj.push((mu+(c/vx)*(mm-mx))*12);hm.push(mu*12);sd.push(Math.sqrt(s2/(v.length-1)*12));beta.push(c/vx);cagr.push(Math.pow(g,12/v.length)-1);nObs.push(v.length);first.push(idx[0]);});
  // complete matrix for co-movement tools: before an asset lists, alpha + beta x market + one of its own residuals drawn at random (keeps its volatility and fat tails)
  const F=H.R.map((r,i)=>{const idx=[];r.forEach((x,t)=>{if(x!=null)idx.push(t);});if(idx.length===T)return r.slice();
    const am=mean(idx.map(t=>r[t]))-beta[i]*mean(idx.map(t=>m[t]));const res=idx.map(t=>r[t]-am-beta[i]*m[t]);const g=rng(1000+i);
    return r.map((x,t)=>x!=null?x:am+beta[i]*m[t]+res[Math.floor(g()*res.length)]);});
  // risk model on the complete matrix: assets listed after the window starts inherit market crashes through their beta (Stambaugh-style), instead of looking safe because they only lived through bull markets
  const sdOwn=sd.slice();const fm=F.map(r=>mean(r));for(let i=0;i<n;i++){let s2=0;for(let t=0;t<T;t++)s2+=(F[i][t]-fm[i])**2;sd[i]=Math.sqrt(s2/(T-1)*12);}
  const Cs=[];for(let i=0;i<n;i++)Cs.push(new Float64Array(n));
  for(let i=0;i<n;i++){Cs[i][i]=1;for(let j=i+1;j<n;j++){let c=0;for(let t=0;t<T;t++)c+=(F[i][t]-fm[i])*(F[j][t]-fm[j]);c/=T-1;Cs[i][j]=Cs[j][i]=c/((sd[i]/Math.sqrt(12))*(sd[j]/Math.sqrt(12)));}}
  let rbar=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)rbar+=Cs[i][j];rbar/=n*(n-1)/2;
  const d=o.shrink;let C=[];for(let i=0;i<n;i++){C.push(new Float64Array(n));for(let j=0;j<n;j++)C[i][j]=i===j?1:(1-d)*Cs[i][j]+d*rbar;}C=psdCorr(C);
  const S=[];for(let i=0;i<n;i++){S.push(new Float64Array(n));for(let j=0;j<n;j++)S[i][j]=C[i][j]*sd[i]*sd[j];}
  const capm=beta.map(b=>rf+b*erp);
  const bl=blackLitterman(capm,S,o.views||[],o.tau,H.ids);
  let mu=o.mode==='bl'?bl:o.mode==='hist'?hmAdj.slice():hmAdj.map((h,i)=>o.trust*h+(1-o.trust)*capm[i]);
  mu=mu.map((x,i)=>o.override[i]!=null?o.override[i]:x);
  const marM=(o.mar??rf)/12;const SC=[];for(let i=0;i<n;i++)SC.push(new Float64Array(n));const ng=F.map(r=>r.map(x=>Math.min(x-marM,0)));
  for(let i=0;i<n;i++)for(let j=i;j<n;j++){let s=0;for(let t=0;t<T;t++)s+=ng[i][t]*ng[j][t];SC[i][j]=SC[j][i]=s/T*12;}
  const mneg=m.map(x=>Math.min(x-mm,0));
  const dbeta=H.R.map((r,i)=>{let s=0,q=0;const mu_=hm[i]/12;r.forEach((x,t)=>{if(x==null)return;s+=Math.min(x-mu_,0)*mneg[t];q+=mneg[t]*mneg[t];});return s/q;});
  const risk=H.R.map(r=>riskStats(r.filter(x=>x!=null),marM));
  return {n,T,hm,hmAdj,sd,sdOwn,beta,cagr,nObs,first,Cs,C,S,SC,F,capm,bl,mu,rbar,dbeta,risk,marM,mkt:{mu:mm*12,sd:Math.sqrt(vm*12)}};
}
function riskStats(r,marM){const T=r.length;let d2=0,gain=0,loss=0,negN=0;for(const x of r){const e=x-marM;if(e<0){d2+=e*e;loss-=e;}else gain+=e;if(x<0)negN++;}
  const s=Array.from(r).sort((a,b)=>a-b);const k=Math.max(1,Math.round(T*.05));let tail=0;for(let i=0;i<k;i++)tail+=s[i];
  let v=1,pk=1,mdd=0,uw=0,maxUw=0;for(const x of r){v*=1+x;if(v>=pk){pk=v;uw=0;}else{uw++;maxUw=Math.max(maxUw,uw);}mdd=Math.max(mdd,1-v/pk);}const cagr=Math.pow(v,12/T)-1;
  return {dd:Math.sqrt(d2/T*12),var95:-s[k-1],cvar95:-tail/k,mdd,maxUw,omega:loss>0?gain/loss:Infinity,pctNeg:negN/T,worst:s[0],cagr,calmar:mdd>0?cagr/mdd:Infinity};}
function maxEig(S){const n=S.length;let v=new Float64Array(n).fill(1/Math.sqrt(n)),l=0;for(let k=0;k<80;k++){const u=matVec(S,v);l=Math.sqrt(dot(u,u))||1e-12;for(let i=0;i<n;i++)v[i]=u[i]/l;}return l;}
function project(v,cap){const n=v.length;let lo=-1e3,hi=1e3;const f=t=>{let s=0;for(let i=0;i<n;i++)s+=Math.min(Math.max(v[i]-t,0),cap[i]);return s;};
  for(let k=0;k<70;k++){const m=(lo+hi)/2;if(f(m)>1)lo=m;else hi=m;}const t=(lo+hi)/2,w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=Math.min(Math.max(v[i]-t,0),cap[i]);return w;}
function solve(mu,S,cap,lam,L,w0,iters){const n=mu.length;const minVar=!isFinite(lam);const step=1/(minVar?2*L:lam*L);
  let x=w0?project(Float64Array.from(w0),cap):project(new Float64Array(n).fill(1/n),cap),y=Float64Array.from(x),t=1;
  for(let k=0;k<iters;k++){const Sy=matVec(S,y),v=new Float64Array(n);for(let i=0;i<n;i++)v[i]=y[i]+step*(minVar?-2*Sy[i]:(mu[i]-lam*Sy[i]));
    const xn=project(v,cap);const tn=(1+Math.sqrt(1+4*t*t))/2;for(let i=0;i<n;i++)y[i]=xn[i]+((t-1)/tn)*(xn[i]-x[i]);x=xn;t=tn;}return x;}
function fastTangency(mu,S,cap,rf,w0,L){L=L||maxEig(S);let best=null;const ev=ll=>{const w=solve(mu,S,cap,Math.exp(ll),L,best?best.w:w0,350);const s=stats(w,mu,S);const r={w,ret:s.ret,vol:s.vol,sharpe:(s.ret-rf)/s.vol};if(!best||r.sharpe>best.sharpe)best=r;return r.sharpe;};
  let a=Math.log(.1),b=Math.log(800);for(let k=0;k<20;k++){const c=b-.618*(b-a),d=a+.618*(b-a);if(ev(c)>ev(d))b=d;else a=c;}return best;}
// highest-expected-return portfolio with volatility <= target: blend of the two efficient-frontier points that bracket it (any blend of feasible portfolios is feasible)
function frontierAt(front,mu,S,target){const f=front.slice().sort((a,b)=>a.vol-b.vol);if(target<=f[0].vol)return f[0];if(target>=f[f.length-1].vol)return f[f.length-1];
  let k=0;while(f[k+1].vol<target)k++;const a=f[k],b=f[k+1];let lo=0,hi=1;
  for(let it=0;it<40;it++){const m=(lo+hi)/2;const w=a.w.map((x,i)=>x*(1-m)+b.w[i]*m);if(stats(w,mu,S).vol>target)hi=m;else lo=m;}
  const w=Float64Array.from(a.w,(x,i)=>x*(1-lo)+b.w[i]*lo);const s=stats(w,mu,S);return {w,ret:s.ret,vol:s.vol};}
function optimize(mu,S,cap,rf){const L=maxEig(S);const minv=solve(mu,S,cap,Infinity,L,null,2500);const front=[];let prev=null;
  for(let k=47;k>=0;k--){const lam=Math.exp(Math.log(.1)+k*(Math.log(600)-Math.log(.1))/47);const w=solve(mu,S,cap,lam,L,prev,500);prev=w;const s=stats(w,mu,S);front.push({w,ret:s.ret,vol:s.vol,sharpe:(s.ret-rf)/s.vol});}
  const best=fastTangency(mu,S,cap,rf,front.reduce((a,b)=>b.sharpe>a.sharpe?b:a).w,L);
  const ms=stats(minv,mu,S);const mvp={w:minv,ret:ms.ret,vol:ms.vol,sharpe:(ms.ret-rf)/ms.vol};front.push(mvp,best);front.sort((p,q)=>p.vol-q.vol);
  const eff=[];let top=-Infinity;for(const p of front){if(p.ret>=top-1e-9){eff.push(p);top=Math.max(top,p.ret);}}return {tangency:best,minvar:mvp,frontier:eff};}
function riskParity(S,active){// equal risk contribution via cyclical coordinate descent (Griveau-Billion, Richard & Roncalli 2013); robust with negative correlations
  const n=S.length,idx=[];for(let i=0;i<n;i++)if(active[i])idx.push(i);const b=1/idx.length;const x=new Float64Array(n);idx.forEach(i=>x[i]=1/Math.sqrt(S[i][i]));
  for(let it=0;it<500;it++){let move=0;for(const i of idx){let s=0;for(const j of idx)if(j!==i)s+=S[i][j]*x[j];const nx=(-s+Math.sqrt(s*s+4*S[i][i]*b))/(2*S[i][i]);move=Math.max(move,Math.abs(nx-x[i])/x[i]);x[i]=nx;}if(move<1e-9)break;}
  let sum=0;for(const i of idx)sum+=x[i];return Float64Array.from(x,v=>v/sum);}
function riskContrib(w,S){const m=matVec(S,w);const v=dot(w,m);return Array.from(w,(x,i)=>v>0?x*m[i]/v:0);}
// monthly series: filled matrix (no gaps)
function portSeries(F,w,mu){const T=F[0].length,out=new Float64Array(T);F.forEach((r,i)=>{if(!w[i])return;const adj=mu?mu[i]/12-mean(r):0;for(let t=0;t<T;t++)out[t]+=w[i]*(r[t]+adj);});return out;}
// monthly series on real listings only: weights re-scaled across assets that traded that month
function portListed(R,w){const T=R[0].length,out=new Float64Array(T),cov=new Float64Array(T);for(let t=0;t<T;t++){let s=0,ws=0;R.forEach((r,i)=>{if(w[i]>0&&r[t]!=null){s+=w[i]*r[t];ws+=w[i];}});out[t]=ws>0?s/ws:0;cov[t]=ws;}out.coverage=cov;return out;}
function exactSC(F,w,marM){const n=F.length,T=F[0].length,p=portSeries(F,w),SC=[];for(let i=0;i<n;i++)SC.push(new Float64Array(n));
  for(let t=0;t<T;t++){if(p[t]>=marM)continue;for(let i=0;i<n;i++){const a=F[i][t]-marM;const row=SC[i];for(let j=i;j<n;j++)row[j]+=a*(F[j][t]-marM);}}
  for(let i=0;i<n;i++){for(let j=i;j<n;j++){SC[i][j]=SC[i][j]/T*12;SC[j][i]=SC[i][j];}SC[i][i]+=1e-6;}return SC;}
function optimizeDownside(F,mu,cap,mar,marM,seeds){const dd=w=>riskStats(portSeries(F,w),marM).dd;const so=w=>{const d=dd(w);return d>0?(dot(w,mu)-mar)/d:0;};
  let best=null;const consider=w=>{const s=so(w);if(!best||s>best.s)best={w:Float64Array.from(w),s};};seeds.forEach(consider);
  for(let it=0;it<3;it++){const SC=exactSC(F,best.w,marM),L=maxEig(SC);let a=Math.log(.05),b=Math.log(800);
    for(let k=0;k<14;k++){const c=b-.618*(b-a),d=a+.618*(b-a);const wc=solve(mu,SC,cap,Math.exp(c),L,best.w,450),wd=solve(mu,SC,cap,Math.exp(d),L,best.w,450);const sc=so(wc),sd=so(wd);consider(wc);consider(wd);if(sc>sd)b=d;else a=c;}}
  let mw=seeds[seeds.length-1],md=dd(mw);for(let it=0;it<3;it++){const SC=exactSC(F,mw,marM),L=maxEig(SC);const w=solve(mu,SC,cap,Infinity,L,mw,1500);const d2=dd(w);if(d2<md-1e-6){mw=w;md=d2;}else break;}
  const pack=w=>{const r=dot(w,mu),d=dd(w);return {w,ret:r,vol:d,sharpe:(r-mar)/d};};return {tangency:pack(best.w),minvar:pack(mw)};}
// realized alpha: OLS of portfolio excess returns on market excess returns (monthly T-bill as risk-free)
function alphaStats(p,m,rf){const n=p.length;const y=[],x=[];for(let t=0;t<n;t++){y.push(p[t]-rf[t]);x.push(m[t]-rf[t]);}
  const mx=mean(x),my=mean(y);let sxx=0,sxy=0;for(let t=0;t<n;t++){sxx+=(x[t]-mx)**2;sxy+=(x[t]-mx)*(y[t]-my);}const b=sxy/sxx,a=my-b*mx;
  let sse=0,sst=0;const e=[];for(let t=0;t<n;t++){const r=y[t]-a-b*x[t];e.push(r);sse+=r*r;sst+=(y[t]-my)**2;}const s2=sse/(n-2);const se=Math.sqrt(s2*(1/n+mx*mx/sxx));
  const act=p.map((v,t)=>v-m[t]);const ma=mean(act);let te=0;for(const v of act)te+=(v-ma)**2;te=Math.sqrt(te/(n-1)*12);
  const cum=[1];for(let t=0;t<n;t++)cum.push(cum[t]*(1+a+e[t]));const g=s=>{let v=1;for(const r of s)v*=1+r;return Math.pow(v,12/n)-1;};
  const resVol=Math.sqrt(s2*12);return {alpha:a*12,t:a/se,beta:b,r2:sst?1-sse/sst:0,resVol,appraisal:resVol?a*12/resVol:0,active:g(p)-g(m),te,ir:te?ma*12/te:0,cum,n};}
function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function gauss(r){let u=0;while(u===0)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r());}
function randomPortfolios(mu,S,rf,n,seed,active){const r=rng(seed),N=mu.length,out=[];for(let k=0;k<n;k++){const w=new Float64Array(N);let s=0;const sp=r()<.5;for(let i=0;i<N;i++){if(!active[i])continue;let e=-Math.log(r()+1e-12);if(sp)e=e*e*e;w[i]=e;s+=e;}for(let i=0;i<N;i++)w[i]/=s;const st=stats(w,mu,S);out.push({ret:st.ret,vol:st.vol,sharpe:(st.ret-rf)/st.vol});}return out;}
// Michaud resampling: perturb means & covariance by bootstrap sampling error, average max-Sharpe weights
function resampleStep(M,o,cap,k,r){const n=M.n,T=M.T,F=M.F;const pick=Array.from({length:T},()=>Math.floor(r()*T));
  const mus=F.map(row=>{let s=0;for(const t of pick)s+=row[t];return s/T;});const fm=F.map(row=>mean(row));
  const sdv=F.map((row,i)=>{let s=0;for(const t of pick)s+=(row[t]-mus[i])**2;return Math.sqrt(s/(T-1));});
  const C=[];for(let i=0;i<n;i++)C.push(new Float64Array(n));let rb=0;for(let i=0;i<n;i++)for(let j=i;j<n;j++){let c=0;for(const t of pick)c+=(F[i][t]-mus[i])*(F[j][t]-mus[j]);c/=(T-1)*sdv[i]*sdv[j];C[i][j]=C[j][i]=i===j?1:c;if(i!==j)rb+=c;}
  rb/=n*(n-1)/2;const S=[];for(let i=0;i<n;i++){S.push(new Float64Array(n));for(let j=0;j<n;j++)S[i][j]=(i===j?1:(1-o.shrink)*C[i][j]+o.shrink*rb)*sdv[i]*sdv[j]*12;}
  const mu=M.mu.map((x,i)=>x+(mus[i]-fm[i])*12);return fastTangency(mu,S,cap,o.rf,null).w;}
function monteCarlo(o){const r=rng(o.seed),T=Math.round(o.years*12),P=o.paths;const vals=new Float64Array(P*(T+1));
  const m=Math.log(1+o.mu)-0.5*Math.log(1+o.vol*o.vol/((1+o.mu)**2)),s=Math.sqrt(Math.log(1+o.vol*o.vol/((1+o.mu)**2)));const L=o.series.length;
  for(let p=0;p<P;p++){let v=o.start,idx=Math.floor(r()*L);vals[p*(T+1)]=v;for(let t=1;t<=T;t++){let ret;if(o.method==='boot'){if(r()<1/6)idx=Math.floor(r()*L);else idx=(idx+1)%L;ret=o.series[idx];}else ret=Math.exp(m/12+s/Math.sqrt(12)*gauss(r))-1;v=Math.max(0,v*(1+ret)+o.monthly);vals[p*(T+1)+t]=v;}}
  // returns are measured on nominal paths, then converted to real; values are deflated to today's money when o.real
  const pi=o.infl||0,defl=t=>Math.pow(1+pi,t/12);const ann=new Float64Array(P),y1=new Float64Array(P);
  for(let p=0;p<P;p++){const b=p*(T+1);let g=1;for(let t=1;t<=T;t++){const prev=vals[b+t-1];if(prev>0)g*=(vals[b+t]-o.monthly)/prev;if(t===12)y1[p]=g-1;}ann[p]=Math.pow(Math.max(g,1e-9),12/T)-1;if(T<12)y1[p]=Math.pow(Math.max(g,1e-9),12/T)-1;
    if(o.real){ann[p]=(1+ann[p])/(1+pi)-1;y1[p]=(1+y1[p])/(1+pi)-1;}}
  let invested=o.start+o.monthly*T;
  if(o.real){const d=new Float64Array(T+1);for(let t=0;t<=T;t++)d[t]=1/defl(t);for(let p=0;p<P;p++){const b=p*(T+1);for(let t=1;t<=T;t++)vals[b+t]*=d[t];}invested=o.start;for(let t=1;t<=T;t++)invested+=o.monthly*d[t];}
  const pct=[5,25,50,75,95],bands=pct.map(()=>new Float64Array(T+1)),col=new Float64Array(P);
  for(let t=0;t<=T;t++){for(let p=0;p<P;p++)col[p]=vals[p*(T+1)+t];col.sort();pct.forEach((q,k)=>bands[k][t]=col[Math.min(P-1,Math.floor(q/100*P))]);}
  const fin=new Float64Array(P),dd=new Float64Array(P);
  for(let p=0;p<P;p++){const b=p*(T+1);fin[p]=vals[b+T];let pk=0,md=0;for(let t=0;t<=T;t++){const x=vals[b+t];if(x>pk)pk=x;if(pk>0)md=Math.max(md,1-x/pk);}dd[p]=md;}
  const so=a=>Float64Array.from(a).sort();const fs=so(fin),as=so(ann),ds=so(dd),ys=so(y1);const q=(a,x)=>a[Math.min(a.length-1,Math.floor(x*a.length))];const k5=Math.max(1,Math.floor(P*.05));let tl=0;for(let i=0;i<k5;i++)tl+=ys[i];
  const samples=[];for(let p=0;p<Math.min(24,P);p++)samples.push(vals.subarray(p*(T+1),(p+1)*(T+1)));
  return {T,bands,invested,real:!!o.real,infl:pi,deflT:defl(T),ann:as,pLoss:fs.filter(x=>x<invested).length/P,pDouble:fs.filter(x=>x>=2*invested).length/P,annMed:q(as,.5),ann5:q(as,.05),ann95:q(as,.95),ddMed:q(ds,.5),dd95:q(ds,.95),var1y:-ys[k5-1],cvar1y:-tl/k5,pDown1y:ys.filter(x=>x<0).length/P,samples};}
function growth(series){const v=[1];for(const r of series)v.push(v[v.length-1]*(1+r));let pk=1;const ddS=v.map(x=>{pk=Math.max(pk,x);return x/pk-1;});const T=series.length,m=mean(series);let s=0;for(const r of series)s+=(r-m)**2;
  return {v,ddS,cagr:Math.pow(v[T],12/T)-1,vol:Math.sqrt(s/(T-1)*12),maxDD:-Math.min(...ddS),best:Math.max(...series),worst:Math.min(...series)};}
// walk-forward: re-estimate on trailing window every `step` months, hold out-of-sample
function walkForwardStep(H,o,t0,win){const n=H.ids.length,a=t0-win;const E=[];for(let i=0;i<n;i++){let c=0;for(let t=a;t<t0;t++)if(H.R[i][t]!=null)c++;if(c>=36&&H.R[i][t0-1]!=null&&o.active[i])E.push(i);}
  const sub={ids:E.map(i=>H.ids[i]),R:E.map(i=>H.R[i].slice(a,t0)),mkt:H.mkt.slice(a,t0),T:win};const k=E.length;
  const M=buildModel(sub,{...o,mode:o.mode==='bl'?'blend':o.mode,views:[],override:E.map(()=>null)});
  const capE=Math.max(o.cap,1/k+1e-6),cap=new Float64Array(k).fill(capE);const L=maxEig(M.S);
  const tan=fastTangency(M.mu,M.S,cap,o.rf,null,L).w,mv=solve(M.mu,M.S,cap,Infinity,L,null,1500),rp=riskParity(M.S,E.map(()=>true));
  const up=w=>{const f=new Float64Array(n);E.forEach((i,q)=>f[i]=w[q]);return f;};
  return {tan:up(tan),mv:up(mv),rp:up(rp),ew:up(new Float64Array(k).fill(1/k)),k};}
if(typeof module!=='undefined')module.exports={dropMonths,frontierAt,toBase,alphaStats,META,parseData,sliceH,buildModel,ledoitWolf,blackLitterman,optimize,fastTangency,riskParity,riskContrib,portSeries,portListed,optimizeDownside,riskStats,randomPortfolios,resampleStep,monteCarlo,growth,walkForwardStep,stats,dot,matVec,rng};
