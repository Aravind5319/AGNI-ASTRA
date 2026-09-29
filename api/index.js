const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

/* ============ CONFIG ============ */
const CFG={wb:[26,35],warnWBGT:29,nightPoor:30,nightLim:27,wT:.72,wN:.28,
 ref:{k:[5,14],e:[5,20],o:[3,30],d:[.5,6]}
};

/* ============ LOCATIONS ============ */
const LOCATIONS=[
 {id:'pdy',name:'Puducherry (UT)',ready:true,weather:{t:36,rh:72,tn:29},
  wards:[
   ['Debarayanpeth',3771,10,15,3.5,22,.55,.45],
   ['Muthialpet (West)',4169,11,13,4,18,.5,.5],
   ['Solainagar',10506,9,11,2.8,12,.75,.3],
   ['Vaithikuppam',7664,8,9,3,8,.85,.2],
   ['V.O.C. Nagar',6145,12,17,4.5,26,.4,.6],
   ['Thiruvalluvar Nagar',5068,13,10,3.8,20,.45,.55],
   ['Kurusukuppam',6623,10,19,5,28,.35,.65],
   ['Dharmapuri',8666,7,8,2.5,6,.9,.15]
  ]},
 {id:'del',name:'Delhi (coming soon)',ready:false},
 {id:'che',name:'Chennai (coming soon)',ready:false},
 {id:'mum',name:'Mumbai (coming soon)',ready:false}];

/* ============ ENGINES ============ */
function heatIndexC(tc,rh){const T=tc*9/5+32;let hi=.5*(T+61+(T-68)*1.2+rh*.094);
 if((hi+T)/2<80)return{v:(hi-32)*5/9,ok:tc>=26.7};
 hi=-42.379+2.04901523*T+10.14333127*rh-.22475541*T*rh-.00683783*T*T-.05481717*rh*rh+.00122874*T*T*rh+.00085282*T*rh*rh-.00000199*T*T*rh*rh;
 if(rh<13&&T>=80&&T<=112)hi-=(13-rh)/4*Math.sqrt((17-Math.abs(T-95))/17);
 if(rh>85&&T>=80&&T<=87)hi+=(rh-85)/10*(87-T)/5;return{v:(hi-32)*5/9,ok:true}}
function wetBulb(T,R){return T*Math.atan(.151977*Math.sqrt(R+8.313659))+Math.atan(T+R)-Math.atan(R-1.676331)+.00391838*Math.pow(R,1.5)*Math.atan(.023101*R)-4.686035}
function engine1(w){const hi=heatIndexC(w.t,w.rh),wbgt=.7*wetBulb(w.t,w.rh)+.3*w.t;
 const night=w.tn>=CFG.nightPoor?'POOR':w.tn>=CFG.nightLim?'LIMITED':'GOOD';
 return{t:w.t,rh:w.rh,tn:w.tn,hi:hi.v,hiOk:hi.ok,wbgt,night}}

const cl=x=>Math.max(0,Math.min(1,x)),nz=(v,[a,b])=>cl((v-a)/(b-a)),mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function engine2(w){const nk=nz(w.k,CFG.ref.k),ne=nz(w.e,CFG.ref.e),no=nz(w.o,CFG.ref.o),nd=nz(w.d,CFG.ref.d);
 const sens=mean([nk,ne,nd]),expo=mean([no,w.surf]),cap=mean([w.cool,1-w.house]);
 return{nk,ne,no,nd,sens,expo,cap,human:.35*sens+.35*expo+.3*(1-cap),
  workers:Math.round(w.pop*w.o/100),elderly:Math.round(w.pop*w.e/100),kids:Math.round(w.pop*w.k/100),disabled:Math.round(w.pop*w.d/100)}}

function engine3(e,ward,h){const te=CFG.wT*nz(e.wbgt,CFG.wb)+CFG.wN*(e.night=='POOR'?1:e.night=='LIMITED'?.5:0);
 const cat={'Outdoor workers':te*(.3+.7*h.no),'Elderly':te*(.3+.7*mean([h.ne,1-ward.cool])),'Children':te*(.3+.7*h.nk),'Disabled / low-mobility':te*(.3+.7*mean([h.nd,1-ward.cool]))};
 const all=te*(.4+.6*h.human);return{te,all,'All':all,...cat}}

function wardObj(l, i){const a=l.wards[i];return{name:a[0],pop:a[1],k:a[2],e:a[3],d:a[4],o:a[5],cool:a[6],house:1-a[6],surf:a[7]}}

function why(e,w,h,r){const a=[];
 if(e.rh>=60)a.push(`Humidity is ${e.rh}%, which limits sweat evaporation — the body's main way of cooling itself`);
 if(e.wbgt>=CFG.warnWBGT)a.push(`WBGT (environmental heat stress) is estimated at ${e.wbgt.toFixed(1)}°C, above the ${CFG.warnWBGT}°C caution line used here`);
 if(e.night!='GOOD')a.push(`Night temperature stays around ${e.tn}°C, so the body gets ${e.night=='POOR'?'little to no':'limited'} overnight recovery`);
 if(h.no>.5)a.push(`${w.o}% of the ward works outdoors, adding physical exertion heat on top of the weather`);
 if(h.ne>.5)a.push(`${w.e}% are older adults, who sweat less efficiently and have less cardiovascular reserve`);
 if(h.nd>.5)a.push(`${w.d}% are people with disabilities or low mobility, who may be less able to move to a cooler place`);
 if(h.nk>.5)a.push(`${w.k}% are young children, who heat up faster due to a higher skin-surface-to-body ratio`);
 if(w.cool<.4)a.push('Low cooling access in this ward (fans/AC availability, estimated)');
 return a.length?a:['Thermal stress is currently the main contributing input']}

function remedies(e,w,h,r){const R=[];
 if(e.rh>=60)R.push({icon: '<i data-lucide="droplets"></i>', text: 'Increase hydration messaging — humid heat blocks sweat cooling, so fluids matter more than usual'});
 if(h.no>.5)R.push({icon: '<i data-lucide="hard-hat"></i>', text: 'Shift outdoor and manual work away from the early-afternoon peak heat window'});
 if(h.ne>.5&&e.night!='GOOD')R.push({icon: '<i data-lucide="users"></i>', text: 'Check on older residents, especially those living alone, since warm nights give them no recovery'});
 if(h.nd>.5)R.push({icon: '<i data-lucide="wheelchair"></i>', text: 'Ensure disabled/low-mobility residents have an easy way to reach a cool space or ask for help'});
 if(h.nk>.5)R.push({icon: '<i data-lucide="school"></i>', text: 'Review outdoor school and play activity timing for children'});
 if(w.cool<.4)R.push({icon: '<i data-lucide="snowflake"></i>', text: 'Consider opening or preparing a nearby cooling space'});
 if(!R.length)R.push({icon: '<i data-lucide="info"></i>', text: 'No specific precaution triggered for this ward right now — general heat caution still applies.'});
 return R}

/* ============ API ROUTES ============ */
app.get('/api/locations', (req, res) => {
  res.json(LOCATIONS.map(l => ({ id: l.id, name: l.name, ready: l.ready })));
});

app.get('/api/data/:locId', (req, res) => {
  const l = LOCATIONS.find(loc => loc.id === req.params.locId);
  if(!l || !l.ready) {
     return res.json({ ready: false, l: { id: l?.id, name: l?.name, ready: l?.ready } });
  }
  
  const e = engine1(l.weather);
  const wardsData = l.wards.map((_, i) => {
    const w = wardObj(l, i);
    const h = engine2(w);
    const r = engine3(e, w, h);
    return {
      w, h, r,
      why: why(e, w, h, r),
      remedies: remedies(e, w, h, r)
    };
  });
  
  res.json({
    ready: true,
    l,
    e,
    wardsData
  });
});

// For local testing
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API running locally on port ${PORT}`));
}

// Export for Vercel
module.exports = app;
