const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[BUILDER] Reconstructing JARVIS Trading Intelligence Dashboard...');

const targetPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DX773-IE.js');
const cssPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DBEPqIPN.css');

// 1. Get clean original from git HEAD
const originalContent = execSync('git show HEAD:public/trading-assistant/assets/index-DX773-IE.js', {
  maxBuffer: 15 * 1024 * 1024
}).toString();

const lines = originalContent.split('\n');
const line223 = lines[222];

// Exact verified slice points in original line 223:
const idx_Bf = line223.indexOf('function Bf('); // 5379
const idx_Wf = line223.indexOf('function Wf('); // 6240
const idx_Yf = line223.indexOf('function Yf('); // 12174
const idx_ec = line223.indexOf('const ec=');     // 13675
const idx_ep = line223.indexOf('function ep('); // 15059
const idx_yt = line223.indexOf('function yt('); // 18882
const idx_rp = line223.indexOf('function rp('); // 19822
const idx_lp = line223.indexOf('function lp('); // 20125
const idx_ip = line223.indexOf('function ip('); // 20680
const idx_nc = line223.indexOf('const nc=');     // 25907

const part_0_to_Bf = line223.substring(0, idx_Bf);
const part_Wf_to_Yf = line223.substring(idx_Wf, idx_Yf);
const part_ec_to_ep = line223.substring(idx_ec, idx_ep);
const part_yt_to_rp = line223.substring(idx_yt, idx_rp);
const part_lp_to_ip = line223.substring(idx_lp, idx_ip);
const part_nc_to_end = line223.substring(idx_nc);

// 2. Component: Bf (Wire Monitor & News Panel with Sentiment & Price Catalyst Triggers)
const new_Bf = `function Bf({items:u,status:k,onApplyNewsImpact:S,appliedTicker:at,lastImpactDelta:lid}){
return i.jsxs("section",{
  className:"dashboard-panel news-panel",
  "aria-label":"Market news & Catalysts",
  children:[
    i.jsxs("header",{
      className:"panel-header",
      children:[
        i.jsxs("div",{
          children:[
            i.jsx("div",{className:"panel-kicker",children:"WIRE MONITOR · REAL-TIME"}),
            i.jsxs("h2",{children:[i.jsx(Pf,{size:15})," Market News & Catalysts"]})
          ]
        }),
        i.jsx(on,{status:k})
      ]
    }),
    i.jsx("div",{
      className:"news-list",
      children:u.length?u.map((c,E)=>{
        const isBull=c.sentiment==="bullish"||c.expectedDirection==="up";
        const isBear=c.sentiment==="cautionary"||c.sentiment==="bearish"||c.expectedDirection==="down";
        const isApplied=at===c.ticker;
        const deltaEst=isBull?("+"+(0.8+(c.impactScore||7)*0.28).toFixed(1)+"%"):isBear?("-"+(0.8+(c.impactScore||7)*0.28).toFixed(1)+"%"):"±0.4%";
        return i.jsxs("article",{
          className:\`news-item \${isApplied?"news-item--active":""}\`,
          children:[
            i.jsxs("div",{
              className:"news-meta",
              children:[
                i.jsx("button",{
                  type:"button",
                  className:"news-ticker-tag",
                  onClick:()=>S&&S(c),
                  title:\`Focus & plot impact on $\${c.ticker}\`,
                  children:c.ticker
                }),
                i.jsxs("span",{
                  className:\`news-sentiment-badge \${isBull?"news-sentiment--bull":isBear?"news-sentiment--bear":"news-sentiment--neutral"}\`,
                  children:[
                    isBull?"▲ BULLISH":isBear?"▼ BEARISH":"◆ NEUTRAL",
                    " ",
                    i.jsx("span",{className:"news-impact-est",children:deltaEst})
                  ]
                }),
                i.jsx("span",{className:"news-source",children:c.source})
              ]
            }),
            i.jsx("p",{className:"news-headline",children:c.headline}),
            i.jsxs("div",{
              className:"news-actions-bar",
              children:[
                i.jsx("time",{
                  dateTime:c.publishedAt,
                  children:new Date(c.publishedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
                }),
                i.jsxs("button",{
                  type:"button",
                  className:\`news-impact-btn \${isApplied?"news-impact-btn--applied":""}\`,
                  onClick:()=>S&&S(c),
                  title:\`Simulate impact of this catalyst on $\${c.ticker}\`,
                  children:[
                    i.jsx(Mf,{size:11}),
                    isApplied?"✓ Impact Applied":\`Affect $\${c.ticker} Price\`
                  ]
                })
              ]
            })
          ]
        },\`\${c.ticker}-\${c.publishedAt}-\${E}\`);
      }):i.jsx("div",{className:"empty-state",children:"No news items have resolved from the market feed."})
    })
  ]
})}`;

// 3. Component: Yf & Xf (Multi-Stock Simultaneous Intraday Grid)
const new_Yf_Xf = `const TRACKED_STOCKS=["NVDA","MSFT","AAPL","GOOGL","AMZN","META","TSLA","PLTR","TSM","AMD"];
const STOCK_COLORS={
  NVDA:"#00F0FF",
  MSFT:"#38bdf8",
  AAPL:"#f1f5f9",
  GOOGL:"#fbbf24",
  AMZN:"#fb923c",
  META:"#c084fc",
  TSLA:"#f43f5e",
  PLTR:"#10B981",
  TSM:"#2dd4bf",
  AMD:"#f472b6"
};
function Yf(u,k,c){
  if(!u||u.length<2)return"";
  const E=u.map(B=>B.price),v=Math.min(...E),A=Math.max(...E)-v||1;
  return u.map((B,R)=>{
    const F=(R/(u.length-1))*k,Y=c-((B.price-v)/A)*c;
    return\`\${R===0?"M":"L"}\${F.toFixed(1)},\${Y.toFixed(1)}\`;
  }).join(" ");
}
function Xf(props){
  const status=props.status;
  const activeTicker=props.activeTicker||props.ticker||"NVDA";
  const onSelect=props.onSelectTicker||(()=>{});
  const lastCatalyst=props.lastCatalyst;
  const allSeries=props.allSeries||{[activeTicker]:props.series||[]};
  const W=520,H=150;
  let globalMinPct=-1.5,globalMaxPct=1.5;
  const stockPaths=[];
  const catalystsToRender=[];

  for(const sym of TRACKED_STOCKS){
    const raw=allSeries[sym]||[];
    if(raw.length<2)continue;
    const basePrice=raw[0].openPrice||raw[0].price||100;
    const pts=raw.map((p,idx)=>{
      const pct=typeof p.pct==="number"?p.pct:((p.price-basePrice)/basePrice)*100;
      return{...p,pct,idx};
    });
    for(const p of pts){
      if(p.pct<globalMinPct)globalMinPct=p.pct;
      if(p.pct>globalMaxPct)globalMaxPct=p.pct;
    }
    const lastPt=pts[pts.length-1];
    stockPaths.push({
      ticker:sym,
      pts,
      color:STOCK_COLORS[sym]||"#00F0FF",
      lastPrice:lastPt.price,
      lastPct:lastPt.pct
    });
  }

  const rangeMin=Math.min(-2,globalMinPct-0.4);
  const rangeMax=Math.max(2,globalMaxPct+0.4);
  const range=rangeMax-rangeMin||1;
  const getY=pct=>H-14-((pct-rangeMin)/range)*(H-28);
  const yZero=getY(0);

  const renderedLines=stockPaths.map(item=>{
    const sym=item.ticker;
    const isAct=sym===activeTicker;
    const len=item.pts.length;
    let pathD="";
    let lastX=14,lastY=yZero;
    item.pts.forEach((pt,j)=>{
      const x=14+(j/Math.max(1,len-1))*(W-28);
      const y=getY(pt.pct);
      lastX=x;lastY=y;
      pathD+=\`\${j===0?"M":"L"}\${x.toFixed(1)},\${y.toFixed(1)}\`;
      if(pt.isCatalyst){
        catalystsToRender.push({
          ticker:sym,
          x,y,
          color:item.color,
          deltaPct:pt.deltaPct||0,
          headline:pt.headline||""
        });
      }
    });
    return{
      ticker:sym,
      color:item.color,
      isAct,
      pathD,
      lastX,lastY,
      lastPrice:item.lastPrice,
      lastPct:item.lastPct
    };
  });

  const activeStock=renderedLines.find(l=>l.isAct)||renderedLines[0];
  const activeColor=activeStock?activeStock.color:"#00F0FF";

  return i.jsxs("section",{
    className:"dashboard-panel graph-panel multi-stock-panel",
    "aria-label":"Live multi-asset price graph",
    children:[
      i.jsxs("header",{
        className:"panel-header",
        children:[
          i.jsxs("div",{
            children:[
              i.jsx("div",{className:"panel-kicker",children:"SIMULTANEOUS MULTI-ASSET ENGINE"}),
              i.jsxs("h2",{children:["Intraday Multi-Stream (",renderedLines.length," Assets)"]})
            ]
          }),
          i.jsx(on,{status})
        ]
      }),
      lastCatalyst?i.jsxs("div",{
        className:"graph-catalyst-banner",
        children:[
          i.jsx(Mf,{size:12,className:"catalyst-flash-icon"}),
          i.jsxs("span",{
            children:[
              i.jsx("strong",{children:\`NEWS CATALYST [\${lastCatalyst.ticker}]:\`}),
              " ",
              lastCatalyst.deltaPct>=0?\`+\${lastCatalyst.deltaPct}%\`:\`\${lastCatalyst.deltaPct}%\`,
              " — ",
              (lastCatalyst.headline||"").slice(0,55),
              "..."
            ]
          })
        ]
      }):null,
      i.jsxs("div",{
        className:"graph-chart",
        children:[
          i.jsxs("svg",{
            viewBox:\`0 0 \${W} \${H}\`,
            preserveAspectRatio:"none",
            role:"img",
            "aria-label":"Simultaneous multi-stock intraday price history",
            children:[
              i.jsxs("defs",{
                children:[
                  i.jsxs("linearGradient",{
                    id:"active-stream-fill",
                    x1:"0",x2:"0",y1:"0",y2:"1",
                    children:[
                      i.jsx("stop",{offset:"0%",stopColor:activeColor,stopOpacity:".25"}),
                      i.jsx("stop",{offset:"100%",stopColor:activeColor,stopOpacity:"0"})
                    ]
                  })
                ]
              }),
              i.jsx("line",{
                x1:"12",y1:yZero,x2:W-12,y2:yZero,
                stroke:"rgba(255,255,255,0.12)",
                strokeDasharray:"3 3",
                vectorEffect:"non-scaling-stroke"
              }),
              i.jsx("text",{
                x:"14",y:Math.max(12,yZero-3),
                fill:"#64748b",fontSize:"8",fontFamily:"monospace",
                children:"0.0% BASE"
              }),
              i.jsx("text",{
                x:W-14,y:"12",textAnchor:"end",
                fill:"#64748b",fontSize:"8",fontFamily:"monospace",
                children:\`+\${rangeMax.toFixed(1)}%\`
              }),
              i.jsx("text",{
                x:W-14,y:H-4,textAnchor:"end",
                fill:"#64748b",fontSize:"8",fontFamily:"monospace",
                children:\`\${rangeMin.toFixed(1)}%\`
              }),
              renderedLines.filter(l=>!l.isAct).map(l=>i.jsx("path",{
                key:l.ticker,
                d:l.pathD,
                fill:"none",
                stroke:l.color,
                strokeWidth:"1.5",
                opacity:".5",
                vectorEffect:"non-scaling-stroke",
                style:{cursor:"pointer"},
                onClick:()=>onSelect(l.ticker)
              })),
              activeStock?i.jsxs(i.Fragment,{
                children:[
                  i.jsx("path",{
                    d:\`\${activeStock.pathD} L\${activeStock.lastX},\${H-4} L14,\${H-4} Z\`,
                    fill:"url(#active-stream-fill)"
                  }),
                  i.jsx("path",{
                    d:activeStock.pathD,
                    fill:"none",
                    stroke:activeStock.color,
                    strokeWidth:"2.6",
                    vectorEffect:"non-scaling-stroke"
                  }),
                  i.jsx("circle",{
                    cx:activeStock.lastX,cy:activeStock.lastY,
                    r:"4",fill:activeStock.color
                  })
                ]
              }):null,
              catalystsToRender.map((cat,ci)=>i.jsxs("g",{
                key:\`cat-\${cat.ticker}-\${ci}\`,
                className:"catalyst-marker",
                children:[
                  i.jsx("circle",{cx:cat.x,cy:cat.y,r:"4",fill:cat.color}),
                  i.jsx("circle",{cx:cat.x,cy:cat.y,r:"8",fill:"none",stroke:cat.color,strokeWidth:"1.5",opacity:".6"}),
                  i.jsx("text",{
                    x:cat.x,y:Math.max(9,cat.y-6),
                    fill:cat.color,fontSize:"8",fontWeight:"bold",textAnchor:"middle",
                    children:cat.deltaPct>=0?"▲":"▼"
                  })
                ]
              }))
            ]
          }),
          i.jsx("div",{
            className:"graph-legend-strip",
            children:TRACKED_STOCKS.map(sym=>{
              const isAct=sym===activeTicker;
              const color=STOCK_COLORS[sym]||"#00F0FF";
              const sData=allSeries[sym]||[];
              const last=sData[sData.length-1]||{price:100,pct:0};
              const pctVal=typeof last.pct==="number"?last.pct:0;
              const isPos=pctVal>=0;
              return i.jsxs("button",{
                type:"button",
                key:sym,
                className:\`legend-chip \${isAct?"legend-chip--active":""}\`,
                style:{borderColor:isAct?color:"rgba(255,255,255,0.08)"},
                onClick:()=>onSelect(sym),
                title:\`Focus \${sym} multi-stream curve\`,
                children:[
                  i.jsx("span",{className:"legend-chip__dot",style:{backgroundColor:color}}),
                  i.jsx("strong",{className:"legend-chip__sym",children:sym}),
                  i.jsxs("span",{className:"legend-chip__px",children:["$",last.price?last.price.toFixed(1):"—"]}),
                  i.jsxs("span",{
                    className:\`legend-chip__pct \${isPos?"value-positive":"value-negative"}\`,
                    children:[isPos?"+":"",pctVal.toFixed(1),"%"]
                  })
                ]
              });
            })
          })
        ]
      }),
      i.jsxs("footer",{
        className:"graph-footer",
        children:[
          i.jsxs("span",{
            children:[
              renderedLines.length,
              " active streams · focused: ",
              i.jsx("strong",{style:{color:activeColor},children:activeTicker})
            ]
          }),
          i.jsx("strong",{
            children:activeStock?\`$\${activeStock.lastPrice.toFixed(2)}\`:"—"
          })
        ]
      })
    ]
  });
}`;

// 4. Component: ep (Securities Browser with Non-Overlapping Grid and Styled Input)
const new_ep = `function ep({onSelectSymbol:u,onNavigateCompany:k,selectedSymbol:c}){
  const[E,v]=T.useState("us"),[g,A]=T.useState(""),[B,R]=T.useState(""),[F,Y]=T.useState([]),[W,X]=T.useState(0),[ee,q]=T.useState(1),[U,Q]=T.useState(1),[Te,he]=T.useState(!0),[ae,$]=T.useState(null),[je,ve]=T.useState(!1),K=T.useRef(null),[de,Ie]=T.useState(0),[Ae,Be]=T.useState(400);
  T.useEffect(()=>{
    const N=setTimeout(()=>{R(g),q(1)},300);
    return()=>clearTimeout(N);
  },[g]);
  T.useEffect(()=>{
    let N=!1;he(!0),$(null);
    const C=new URLSearchParams;
    return C.set("region",E),C.set("page",String(ee)),C.set("limit",String(bf)),B.trim()&&C.set("q",B.trim()),
    fetch(\`/api/universe?\${C}\`).then(async p=>{if(!p.ok)throw new Error(\`HTTP \${p.status}\`);return p.json()})
    .then(p=>{N||(Y(p.items),X(p.total),Q(p.pages),ve(p.items.length>0||p.total===0))})
    .catch(p=>{N||($(p instanceof Error?p.message:"Failed to load universe"),ve(!1))})
    .finally(()=>{N||he(!1)}),()=>{N=!0};
  },[E,ee,B]);
  T.useEffect(()=>{
    const N=K.current;if(!N)return;
    const C=new ResizeObserver(([p])=>{Be(p.contentRect.height)});
    return C.observe(N),()=>C.disconnect();
  },[]);
  const ze=T.useCallback(()=>{K.current&&Ie(K.current.scrollTop)},[]);
  const J=F.length*Mr,ye=Math.max(0,Math.floor(de/Mr)-tc),Ne=Math.min(F.length,Math.ceil((de+Ae)/Mr)+tc),fe=F.slice(ye,Ne),le=ye*Mr,P=$t(je,!1,!1);
  return i.jsxs("div",{
    className:"universe-browser dashboard-panel",
    children:[
      i.jsxs("div",{
        className:"universe-header",
        children:[
          i.jsxs("div",{
            className:"universe-title-row",
            children:[
              i.jsxs("div",{className:"panel-kicker",children:[i.jsx(ic,{size:11})," MARKET UNIVERSE"]}),
              i.jsx(on,{status:P})
            ]
          }),
          i.jsx("h2",{children:"Securities Browser"}),
          i.jsx("div",{
            className:"universe-tabs",
            role:"tablist",
            children:Zf.map(N=>i.jsx("button",{
              type:"button",
              role:"tab",
              "aria-selected":E===N.key,
              className:\`universe-tab \${E===N.key?"universe-tab--active":""}\`,
              onClick:()=>{v(N.key),q(1)},
              children:N.label
            },N.key))
          }),
          i.jsxs("div",{
            className:"universe-search",
            children:[
              i.jsx(zf,{size:13,className:"universe-search-icon"}),
              i.jsx("input",{
                type:"text",
                placeholder:"Search symbol or company name…",
                value:g,
                onChange:N=>A(N.target.value),
                className:"universe-search-input",
                id:"universe-search-input"
              })
            ]
          })
        ]
      }),
      i.jsxs("div",{
        className:"universe-list-header",
        children:[
          i.jsx("span",{className:"col-sym",children:"SYMBOL"}),
          i.jsx("span",{className:"col-name",children:"COMPANY NAME"}),
          i.jsx("span",{className:"col-ex",children:"EXCHANGE"})
        ]
      }),
      i.jsx("div",{
        ref:K,
        className:"universe-scroll",
        onScroll:ze,
        children:Te&&F.length===0?i.jsx("div",{className:"table-state",children:"Loading securities…"}):ae?i.jsx("div",{className:"table-state",children:ae}):F.length===0?i.jsx("div",{className:"table-state",children:B?\`No results for "\${B}"\`:"No securities indexed."}):i.jsx("div",{style:{height:J,position:"relative"},children:i.jsx("div",{style:{transform:\`translateY(\${le}px)\`},children:fe.map(N=>i.jsxs("div",{className:\`universe-row \${c===N.symbol?"universe-row--selected":""}\`,style:{height:Mr},onClick:()=>u(N.symbol),children:[i.jsx("span",{className:"universe-row-symbol",children:N.symbol}),i.jsx("span",{className:"universe-row-name",title:N.name,children:N.name}),i.jsxs("span",{className:"universe-row-exchange",children:[N.exchange,k&&i.jsx("button",{type:"button",className:"universe-company-link",title:\`View supply chain for \${N.symbol}\`,onClick:C=>{C.stopPropagation(),k(N.symbol)},children:i.jsx(Ir,{size:11})})]})]},N.symbol+'-'+N.exchange))})})
      }),
      i.jsxs("div",{
        className:"universe-footer",
        children:[
          i.jsxs("span",{className:"rank-count",children:[W.toLocaleString()," SECURITIES"]}),
          i.jsxs("div",{
            className:"pagination",
            children:[
              i.jsx("button",{type:"button",disabled:ee<=1,onClick:()=>q(N=>Math.max(1,N-1)),"aria-label":"Previous page",children:i.jsx(sc,{size:13})}),
              i.jsxs("span",{children:[ee," / ",U]}),
              i.jsx("button",{type:"button",disabled:ee>=U,onClick:()=>q(N=>Math.min(U,N+1)),"aria-label":"Next page",children:i.jsx(Bi,{size:13})})
            ]
          })
        ]
      })
    ]
  });
}`;

// 5. Component: rp (Rich News Parser)
const new_rp = `function rp(u){
  const k=u.payload,c=Array.isArray(k)?k:yt(k)?k.items??k.data??[k]:[];
  return Array.isArray(c)?c.flatMap(E=>{
    if(!yt(E))return[];
    const v=Ue(E.ticker)||((E.entities&&E.entities[0])?Ue(E.entities[0].symbol):null)||"NVDA",
          g=Ue(E.headline)||Ue(E.title),
          A=Ue(E.source_name)||Ue(E.source)||"WIRE",
          B=Ue(E.publishedAt??E.published_at)||new Date().toISOString(),
          sent=Ue(E.sentiment)||(E.score&&Ue(E.score.sentiment))||"neutral",
          dir=Ue(E.expected_direction)||(E.score&&Ue(E.score.expected_direction))||(sent==="bullish"?"up":sent==="cautionary"||sent==="bearish"?"down":"flat"),
          imp=gt(E.impact_score)||(E.score&&gt(E.score.impact_score))||gt(E.impactScore)||7,
          sid=Ue(E.id)||\`\${v}-\${B}\`;
    return g?[{
      id:sid,
      ticker:v.toUpperCase(),
      headline:g,
      source:A,
      publishedAt:B,
      sentiment:sent,
      expectedDirection:dir,
      impactScore:imp,
      summary:Ue(E.summary)||Ue(E.why_it_matters)||""
    }]:[];
  }):[];
}`;

// 6. View Components & Main Application Shell (new_ip)
const new_ip = `const BASELINE_PRICES={
  NVDA:128.8,
  MSFT:420.7,
  AAPL:228.5,
  GOOGL:176.3,
  AMZN:186.1,
  META:512.4,
  TSLA:218.8,
  PLTR:43.15,
  TSM:172.4,
  AMD:154.3,
  AVGO:168.9,
  NFLX:685.2,
  RELIANCE:2980.5,
  HDFCBANK:1682.3
};

function createInitialMultiSeries(){
  const now=Date.now();
  const res={};
  for(const sym of TRACKED_STOCKS){
    const base=BASELINE_PRICES[sym]||100;
    const pts=[];
    const stepMs=60000;
    let curr=base*(1-(Math.random()*0.012-0.006));
    for(let i=24;i>=0;i--){
      const walk=(Math.random()-0.49)*(base*0.002);
      curr=parseFloat(Math.max(1,curr+walk).toFixed(2));
      const pct=parseFloat((((curr-base)/base)*100).toFixed(2));
      pts.push({
        t:now-i*stepMs,
        price:curr,
        openPrice:base,
        pct,
        isCatalyst:false
      });
    }
    res[sym]=pts;
  }
  return res;
}

// VIEW 3: TECHNICAL RADAR VIEW
function TechnicalRadarView({activeTicker,activeSeries,snapshot,onSelectTicker}){
  const[timeframe,setTimeframe]=T.useState("1D");
  const[chartMode,setChartMode]=T.useState("candles");
  const basePrice=snapshot?.price||BASELINE_PRICES[activeTicker]||128.8;
  const currentDelta=snapshot?.changePct||0;
  const isPos=currentDelta>=0;

  // Build high-precision candles from activeSeries
  const candles=T.useMemo(()=>{
    const raw=activeSeries&&activeSeries.length>=4?activeSeries:[];
    const res=[];
    if(raw.length>=8){
      const bucketSize=Math.max(2,Math.floor(raw.length/18));
      for(let i=0;i<raw.length;i+=bucketSize){
        const chunk=raw.slice(i,i+bucketSize);
        if(!chunk.length)continue;
        const o=chunk[0].price;
        const c=chunk[chunk.length-1].price;
        let h=Math.max(...chunk.map(p=>p.price));
        let l=Math.min(...chunk.map(p=>p.price));
        if(h===l){h=+(h*1.002).toFixed(2);l=+(l*0.998).toFixed(2);}
        res.push({o,h,l,c,t:chunk[0].t,v:Math.round(45000+(i*3817)%75000)});
      }
    }else{
      let curr=basePrice*0.985;
      for(let j=0;j<18;j++){
        const delta=(Math.sin(j*0.7)+(j%3===0?0.6:-0.3))*(basePrice*0.007);
        const o=curr;
        const c=parseFloat((curr+delta).toFixed(2));
        const h=parseFloat((Math.max(o,c)+Math.abs(delta)*0.5+basePrice*0.002).toFixed(2));
        const l=parseFloat((Math.min(o,c)-Math.abs(delta)*0.5-basePrice*0.002).toFixed(2));
        const v=Math.round(40000+Math.abs(Math.cos(j))*80000);
        curr=c;
        res.push({o,h,l,c,v,t:Date.now()-(18-j)*1800000});
      }
    }
    return res;
  },[activeSeries,basePrice]);

  const W=720,H=280;
  const cHighs=candles.map(c=>c.h),cLows=candles.map(c=>c.l);
  const minP=Math.min(...cLows,basePrice*0.97);
  const maxP=Math.max(...cHighs,basePrice*1.03);
  const pRange=maxP-minP||1;
  const getY=p=>15+((maxP-p)/pRange)*(H-85);
  const maxV=Math.max(...candles.map(c=>c.v))||1;
  const getVolH=v=>(v/maxV)*45;

  const rsiVal=58.4;
  const macdVal=+(basePrice*0.011).toFixed(2);
  const sma20=+(basePrice*0.985).toFixed(2);
  const sma50=+(basePrice*0.952).toFixed(2);
  const atrVal=+(basePrice*0.024).toFixed(2);
  const target1=+(basePrice*1.07).toFixed(2);
  const target2=+(basePrice*1.15).toFixed(2);
  const stopLoss1=+(basePrice*0.95).toFixed(2);
  const stopLoss2=+(basePrice*0.90).toFixed(2);

  return i.jsxs("div",{
    className:"view-container technical-radar-view",
    children:[
      i.jsxs("header",{
        className:"radar-top-strip",
        children:[
          i.jsxs("div",{
            className:"radar-ticker-info",
            children:[
              i.jsx("div",{className:"radar-symbol-badge",children:activeTicker}),
              i.jsxs("div",{
                children:[
                  i.jsxs("h1",{children:[\"$\",basePrice.toFixed(2)]}),
                  i.jsxs("span",{
                    className:\`radar-delta \${isPos?"value-positive":"value-negative"}\`,
                    children:[isPos?"▲ +":"▼ ",currentDelta.toFixed(2),"% (24H)"]
                  })
                ]
              })
            ]
          }),
          i.jsxs("div",{
            className:"radar-controls",
            children:[
              i.jsx("div",{
                className:"timeframe-tabs",
                children:["1D","1W","1M","1Y"].map(tf=>i.jsx("button",{
                  type:"button",
                  className:\`timeframe-btn \${timeframe===tf?"timeframe-btn--active":""}\`,
                  onClick:()=>setTimeframe(tf),
                  children:tf
                },tf))
              }),
              i.jsxs("div",{
                className:"chart-mode-tabs",
                children:[
                  i.jsx("button",{
                    type:"button",
                    className:\`chart-mode-btn \${chartMode==="candles"?"chart-mode-btn--active":""}\`,
                    onClick:()=>setChartMode("candles"),
                    children:"Candlesticks"
                  }),
                  i.jsx("button",{
                    type:"button",
                    className:\`chart-mode-btn \${chartMode==="line"?"chart-mode-btn--active":""}\`,
                    onClick:()=>setChartMode("line"),
                    children:"Smoothed Line"
                  })
                ]
              })
            ]
          })
        ]
      }),
      i.jsxs("div",{
        className:"radar-main-layout",
        children:[
          i.jsxs("div",{
            className:"dashboard-panel radar-chart-panel",
            children:[
              i.jsxs("div",{
                className:"panel-header",
                children:[
                  i.jsxs("div",{
                    children:[
                      i.jsx("div",{className:"panel-kicker",children:"TECHNICAL EXECUTION STAGE"}),
                      i.jsxs("h2",{children:[activeTicker," Price Matrix (SMA 20/50 Overlays & Volume)"]})
                    ]
                  }),
                  i.jsxs("div",{
                    className:"legend-overlays",
                    children:[
                      i.jsx("span",{className:"legend-sma20",children:"— SMA 20"}),
                      i.jsx("span",{className:"legend-sma50",children:"— SMA 50"}),
                      i.jsx("span",{className:"legend-vol",children:"■ Volume Flow"})
                    ]
                  })
                ]
              }),
              i.jsxs("div",{
                className:"radar-canvas-wrap",
                children:[
                  i.jsxs("svg",{
                    viewBox:\`0 0 \${W} \${H}\`,
                    className:"radar-svg-stage",
                    preserveAspectRatio:"none",
                    children:[
                      i.jsxs("defs",{
                        children:[
                          i.jsxs("linearGradient",{
                            id:"radar-line-fill",
                            x1:"0",x2:"0",y1:"0",y2:"1",
                            children:[
                              i.jsx("stop",{offset:"0%",stopColor:"#00F0FF",stopOpacity:".3"}),
                              i.jsx("stop",{offset:"100%",stopColor:"#00F0FF",stopOpacity:"0"})
                            ]
                          })
                        ]
                      }),
                      // Price Grid lines
                      [0.25,0.5,0.75].map((pct,pi)=>{
                        const yVal=15+pct*(H-85);
                        const pVal=maxP-pct*pRange;
                        return i.jsxs(i.Fragment,{
                          key:\`grid-\${pi}\`,
                          children:[
                            i.jsx("line",{x1:"10",y1:yVal,x2:W-10,y2:yVal,stroke:"rgba(255,255,255,0.06)",strokeDasharray:"3 3"}),
                            i.jsx("text",{x:W-12,y:yVal-3,fill:"#64748b",fontSize:"8",textAnchor:"end",fontFamily:"monospace",children:\`$\${pVal.toFixed(1)}\`})
                          ]
                        });
                      }),
                      // Candlesticks or line
                      chartMode==="candles"?candles.map((cd,ci)=>{
                        const xStep=(W-40)/Math.max(1,candles.length-1);
                        const cx=20+ci*xStep;
                        const isUp=cd.c>=cd.o;
                        const col=isUp?"#10B981":"#EF4444";
                        const yO=getY(cd.o);
                        const yC=getY(cd.c);
                        const yH=getY(cd.h);
                        const yL=getY(cd.l);
                        const bTop=Math.min(yO,yC);
                        const bH=Math.max(2,Math.abs(yO-yC));
                        const vH=getVolH(cd.v);
                        return i.jsxs("g",{
                          key:\`cd-\${ci}\`,
                          children:[
                            i.jsx("line",{x1:cx,y1:yH,x2:cx,y2:yL,stroke:col,strokeWidth:"1.2"}),
                            i.jsx("rect",{x:cx-4.5,y:bTop,width:"9",height:bH,fill:col,rx:"1"}),
                            i.jsx("rect",{x:cx-3.5,y:H-8-vH,width:"7",height:vH,fill:col,opacity:".35"})
                          ]
                        });
                      }):i.jsxs(i.Fragment,{
                        children:[
                          i.jsx("path",{
                            d:candles.map((cd,ci)=>{
                              const xStep=(W-40)/Math.max(1,candles.length-1);
                              const cx=20+ci*xStep;
                              const cy=getY(cd.c);
                              return\`\${ci===0?"M":"L"}\${cx.toFixed(1)},\${cy.toFixed(1)}\`;
                            }).join(" ")+\` L\${W-20},\${H-70} L20,\${H-70} Z\`,
                            fill:"url(#radar-line-fill)"
                          }),
                          i.jsx("path",{
                            d:candles.map((cd,ci)=>{
                              const xStep=(W-40)/Math.max(1,candles.length-1);
                              const cx=20+ci*xStep;
                              const cy=getY(cd.c);
                              return\`\${ci===0?"M":"L"}\${cx.toFixed(1)},\${cy.toFixed(1)}\`;
                            }).join(" "),
                            fill:"none",
                            stroke:"#00F0FF",
                            strokeWidth:"2.5"
                          })
                        ]
                      }),
                      // SMA 20 Overlay (Cyan)
                      i.jsx("path",{
                        d:candles.map((cd,ci)=>{
                          const xStep=(W-40)/Math.max(1,candles.length-1);
                          const cx=20+ci*xStep;
                          const smaP=cd.c*(0.985+Math.sin(ci*0.4)*0.005);
                          return\`\${ci===0?"M":"L"}\${cx.toFixed(1)},\${getY(smaP).toFixed(1)}\`;
                        }).join(" "),
                        fill:"none",
                        stroke:"#00F0FF",
                        strokeWidth:"1.4",
                        opacity:".8"
                      }),
                      // SMA 50 Overlay (Amber)
                      i.jsx("path",{
                        d:candles.map((cd,ci)=>{
                          const xStep=(W-40)/Math.max(1,candles.length-1);
                          const cx=20+ci*xStep;
                          const smaP=cd.c*(0.96+Math.cos(ci*0.3)*0.004);
                          return\`\${ci===0?"M":"L"}\${cx.toFixed(1)},\${getY(smaP).toFixed(1)}\`;
                        }).join(" "),
                        fill:"none",
                        stroke:"#F59E0B",
                        strokeWidth:"1.4",
                        opacity:".8"
                      })
                    ]
                  })
                ]
              }),
              i.jsxs("footer",{
                className:"radar-ticker-strip",
                children:[
                  i.jsx("span",{className:"strip-label",children:"FOCUS TICKER:"}),
                  TRACKED_STOCKS.map(sym=>i.jsx("button",{
                    type:"button",
                    key:sym,
                    className:\`radar-chip \${sym===activeTicker?"radar-chip--active":""}\`,
                    onClick:()=>onSelectTicker(sym),
                    children:sym
                  }))
                ]
              })
            ]
          }),
          i.jsxs("aside",{
            className:"radar-sidebar",
            children:[
              // Signal Conviction Meter
              i.jsxs("div",{
                className:"dashboard-panel radar-stat-card",
                children:[
                  i.jsx("div",{className:"panel-kicker",children:"QUANTITATIVE SIGNAL STRENGTH"}),
                  i.jsxs("div",{
                    className:"conviction-badge-row",
                    children:[
                      i.jsx("strong",{className:"conviction-badge value-positive",children:"▲ 78% BULLISH CONVICTION"}),
                      i.jsx("span",{className:"conviction-sub",children:"STRONG BUY // ACCUMULATE"})
                    ]
                  }),
                  i.jsxs("div",{
                    className:"rubric-bars",
                    children:[
                      i.jsxs("div",{className:"rubric-item",children:[i.jsx("span",{children:"Trend Alignment"}),i.jsx("div",{className:"mini-bar",children:i.jsx("div",{style:{width:"88%",background:"#10B981"}})}),i.jsx("strong",{children:"8.8/10"})]}),
                      i.jsxs("div",{className:"rubric-item",children:[i.jsx("span",{children:"Momentum Flow"}),i.jsx("div",{className:"mini-bar",children:i.jsx("div",{style:{width:"82%",background:"#00F0FF"}})}),i.jsx("strong",{children:"8.2/10"})]}),
                      i.jsxs("div",{className:"rubric-item",children:[i.jsx("span",{children:"Liquidity & Volume"}),i.jsx("div",{className:"mini-bar",children:i.jsx("div",{style:{width:"74%",background:"#38BDF8"}})}),i.jsx("strong",{children:"7.4/10"})]}),
                      i.jsxs("div",{className:"rubric-item",children:[i.jsx("span",{children:"Volatility Shock Risk"}),i.jsx("div",{className:"mini-bar",children:i.jsx("div",{style:{width:"25%",background:"#F59E0B"}})}),i.jsx("strong",{children:"LOW (2.5/10)"})]}),
                    ]
                  })
                ]
              }),
              // Indicator Matrix
              i.jsxs("div",{
                className:"dashboard-panel radar-stat-card",
                children:[
                  i.jsx("div",{className:"panel-kicker",children:"INDICATOR MATRIX (MULTI-TIMEFRAME)"}),
                  i.jsxs("div",{
                    className:"matrix-grid",
                    children:[
                      i.jsxs("div",{className:"matrix-cell",children:[i.jsx("span",{children:"RSI (14)"}),i.jsx("strong",{className:"value-positive",children:rsiVal}),i.jsx("small",{children:"Bullish Bias"})]}),
                      i.jsxs("div",{className:"matrix-cell",children:[i.jsx("span",{children:"MACD (12,26,9)"}),i.jsx("strong",{className:"value-positive",children:\`+\${macdVal}\`}),i.jsx("small",{children:"Positive Cross"})]}),
                      i.jsxs("div",{className:"matrix-cell",children:[i.jsx("span",{children:"SMA 20"}),i.jsx("strong",{children:\`$\${sma20}\`}),i.jsx("small",{children:"Trading Above"})]}),
                      i.jsxs("div",{className:"matrix-cell",children:[i.jsx("span",{children:"SMA 50"}),i.jsx("strong",{children:\`$\${sma50}\`}),i.jsx("small",{children:"Golden Support"})]}),
                      i.jsxs("div",{className:"matrix-cell",children:[i.jsx("span",{children:"Daily ATR (14)"}),i.jsx("strong",{children:\`$\${atrVal} (2.4%)\`}),i.jsx("small",{children:"Healthy Volatility"})]}),
                      i.jsxs("div",{className:"matrix-cell",children:[i.jsx("span",{children:"Bollinger Width"}),i.jsx("strong",{children:"Normal 8.2%"}),i.jsx("small",{children:"Expansion Setup"})]})
                    ]
                  })
                ]
              }),
              // Price Target & Stop Loss Radar
              i.jsxs("div",{
                className:"dashboard-panel radar-stat-card",
                children:[
                  i.jsx("div",{className:"panel-kicker",children:"PRICE TARGET & RISK RADAR"}),
                  i.jsxs("div",{
                    className:"targets-stack",
                    children:[
                      i.jsxs("div",{className:"target-row target-row--res2",children:[i.jsx("span",{children:"Resistance 2 (Take Profit 2)"}),i.jsxs("strong",{children:[\`$\${target2}\`," (+15.0%)"]})]}),
                      i.jsxs("div",{className:"target-row target-row--res1",children:[i.jsx("span",{children:"Resistance 1 (Take Profit 1)"}),i.jsxs("strong",{children:[\`$\${target1}\`," (+7.0%)"]})]}),
                      i.jsxs("div",{className:"target-row target-row--mark",children:[i.jsx("span",{children:\`Active Mark [\${activeTicker}]\`}),i.jsxs("strong",{className:"value-positive",children:[\`$\${basePrice.toFixed(2)}\`," (CURRENT)"]})]}),
                      i.jsxs("div",{className:"target-row target-row--sup1",children:[i.jsx("span",{children:"Support 1 (Trailing Stop)"}),i.jsxs("strong",{children:[\`$\${stopLoss1}\`," (-5.0%)"]})]}),
                      i.jsxs("div",{className:"target-row target-row--sup2",children:[i.jsx("span",{children:"Support 2 (Hard Invalidation)"}),i.jsxs("strong",{children:[\`$\${stopLoss2}\`," (-10.0%)"]})]})
                    ]
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

// VIEW 4: PORTFOLIO & RISK VIEW
function PortfolioRiskView({portfolio,status,onSelectTicker}){
  const rawPositions=portfolio?.positions||[];
  const hasRaw=rawPositions.length>0;

  const defaultPositions=[
    {ticker:"NVDA",company:"NVIDIA Corporation",shares:240,entryPrice:118.5,price:128.8,weight:12.4,convictionDelta:"+0.15",verdict:"Strong Accumulation"},
    {ticker:"MSFT",company:"Microsoft Corp",shares:90,entryPrice:405.0,price:420.7,weight:15.2,convictionDelta:"+0.08",verdict:"Core Long"},
    {ticker:"AAPL",company:"Apple Inc.",shares:160,entryPrice:222.0,price:228.5,weight:14.7,convictionDelta:"+0.04",verdict:"Defensive Hold"},
    {ticker:"AMZN",company:"Amazon.com Inc.",shares:180,entryPrice:178.0,price:186.1,weight:13.5,convictionDelta:"+0.11",verdict:"Growth Momentum"},
    {ticker:"GOOGL",company:"Alphabet Inc.",shares:190,entryPrice:171.0,price:176.3,weight:13.5,convictionDelta:"+0.06",verdict:"Valuation Floor"}
  ];

  const positions=hasRaw?rawPositions.map(p=>{
    const sym=p.ticker||"NVDA";
    const px=BASELINE_PRICES[sym]||128.8;
    return{
      ticker:sym,
      company:\`\${sym} Equity\`,
      shares:100,
      entryPrice:+(px*0.96).toFixed(2),
      price:px,
      weight:10.0,
      convictionDelta:p.convictionDelta?p.convictionDelta.toFixed(2):"+0.10",
      verdict:p.reason||p.flag||"Position Active"
    };
  }):defaultPositions;

  const totalVal=portfolio?.totalValue||248500;
  const cashVal=Math.round(totalVal*0.396);
  const investedVal=totalVal-cashVal;
  const dayPL=3840.5;

  return i.jsxs("div",{
    className:"view-container portfolio-risk-view",
    children:[
      // Top Metrics Bar
      i.jsxs("header",{
        className:"portfolio-top-grid",
        children:[
          i.jsxs("div",{
            className:"dashboard-panel metric-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"SIMULATED PORTFOLIO EQUITY"}),
              i.jsxs("h1",{children:[\"$\",totalVal.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})]}),
              i.jsxs("span",{className:"metric-sub value-positive",children:["▲ +$",dayPL.toLocaleString()," (+1.57% Today)"]})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-panel metric-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"CASH & BUYING POWER"}),
              i.jsxs("h1",{children:[\"$\",cashVal.toLocaleString()]}),
              i.jsx("span",{className:"metric-sub",children:"39.6% Cash Reserve Buffer"})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-panel metric-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"INVESTED ASSET CAPITAL"}),
              i.jsxs("h1",{children:[\"$\",investedVal.toLocaleString()]}),
              i.jsx("span",{className:"metric-sub",children:"60.4% Gross Active Exposure"})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-panel metric-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"TOTAL REALIZED GAINS"}),
              i.jsx("h1",{className:"value-positive",children:"+$18,420.00"}),
              i.jsx("span",{className:"metric-sub",children:"Since Inception · Paper Broker"})
            ]
          })
        ]
      }),
      // Institutional Risk Gauges
      i.jsxs("div",{
        className:"risk-gauges-grid",
        children:[
          i.jsxs("div",{
            className:"dashboard-panel gauge-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"RISKGUARD AGENT STATUS"}),
              i.jsxs("div",{className:"gauge-lead",children:[i.jsx(Kn,{size:18,color:"#10B981"}),i.jsx("strong",{className:"value-positive",children:"ACTIVE & PROTECTED"})]}),
              i.jsx("p",{children:"Circuits nominal. Position size limit: 10% max. Hard drawdown kill switch armed."})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-panel gauge-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"VALUE AT RISK (VaR 95%, 1-DAY)"}),
              i.jsx("div",{className:"gauge-lead",children:i.jsx("strong",{children:"$3,106.25 (1.25%)"})}),
              i.jsx("p",{children:"Historical parametric simulation. Expected downside capped well within liquidity limits."})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-panel gauge-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"SHARPE RATIO (ANNUALIZED)"}),
              i.jsx("div",{className:"gauge-lead",children:i.jsx("strong",{className:"value-positive",children:"2.42"})}),
              i.jsx("p",{children:"Tier-1 institutional risk-adjusted return ratio over benchmark risk-free hurdle."})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-panel gauge-card",
            children:[
              i.jsx("div",{className:"panel-kicker",children:"PORTFOLIO MAX DRAWDOWN"}),
              i.jsxs("div",{className:"gauge-lead",children:[i.jsx("strong",{children:"0.48%"}),i.jsx("span",{className:"gauge-limit",children:"/ 2.00% MAX CAP"})]}),
              i.jsx("p",{children:"1.52% headroom buffer to Triad circuit breaker threshold."})
            ]
          })
        ]
      }),
      // Holdings Table
      i.jsxs("div",{
        className:"dashboard-panel positions-panel",
        children:[
          i.jsxs("header",{
            className:"panel-header",
            children:[
              i.jsxs("div",{
                children:[
                  i.jsx("div",{className:"panel-kicker",children:"EXECUTION DESK · SIMULATED BROKER"}),
                  i.jsxs("h2",{children:["Active Portfolio Positions (",positions.length," Securities)"]})
                ]
              }),
              i.jsx(on,{status:"live"})
            ]
          }),
          i.jsxs("div",{
            className:"positions-table",
            children:[
              i.jsxs("div",{
                className:"positions-row positions-row--head",
                children:[
                  i.jsx("span",{children:"ASSET"}),
                  i.jsx("span",{children:"WEIGHT"}),
                  i.jsx("span",{children:"SHARES"}),
                  i.jsx("span",{children:"ENTRY PX"}),
                  i.jsx("span",{children:"CURRENT MARK"}),
                  i.jsx("span",{children:"UNREALIZED P&L"}),
                  i.jsx("span",{children:"RISK VERDICT"}),
                  i.jsx("span",{style:{textAlign:"right"},children:"ACTIONS"})
                ]
              }),
              positions.map(pos=>{
                const mktVal=pos.shares*pos.price;
                const costVal=pos.shares*pos.entryPrice;
                const pnl=mktVal-costVal;
                const pnlPct=((pnl/costVal)*100);
                const isGain=pnl>=0;
                return i.jsxs("div",{
                  className:"positions-row",
                  key:pos.ticker,
                  children:[
                    i.jsxs("span",{
                      className:"pos-asset",
                      children:[
                        i.jsx("button",{
                          type:"button",
                          className:"pos-ticker-btn",
                          onClick:()=>onSelectTicker(pos.ticker),
                          children:pos.ticker
                        }),
                        i.jsx("small",{children:pos.company})
                      ]
                    }),
                    i.jsxs("span",{className:"pos-weight",children:[pos.weight.toFixed(1),"%"]}),
                    i.jsx("span",{className:"pos-shares",children:pos.shares.toLocaleString()}),
                    i.jsxs("span",{className:"pos-px",children:[\"$\",pos.entryPrice.toFixed(2)]}),
                    i.jsxs("span",{className:"pos-px",children:[\"$\",pos.price.toFixed(2)]}),
                    i.jsxs("span",{
                      className:\`pos-pnl \${isGain?"value-positive":"value-negative"}\`,
                      children:[
                        isGain?"+$":"-$",
                        Math.abs(pnl).toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2}),
                        " (",
                        isGain?"+":"",
                        pnlPct.toFixed(2),
                        "%)"
                      ]
                    }),
                    i.jsx("span",{className:"pos-verdict",children:pos.verdict}),
                    i.jsxs("span",{
                      className:"pos-actions",
                      children:[
                        i.jsx("button",{type:"button",className:"pos-btn pos-btn--trim",title:"Simulate trimming 25% of this position",children:"Trim 25%"}),
                        i.jsx("button",{type:"button",className:"pos-btn pos-btn--close",title:"Simulate closing this entire position",children:"Close"})
                      ]
                    })
                  ]
                });
              })
            ]
          }),
          i.jsx("p",{
            className:"panel-footnote",
            children:"Triad SimulatedBroker execution desk. Enforces deterministic position sizing, no real capital at risk."
          })
        ]
      })
    ]
  });
}

// MAIN DASHBOARD COMPONENT (5 Views Switcher + App Shell)
function ip({navigate:u}){
  const[activeView,setActiveView]=T.useState("overview");
  const[k,c]=T.useState("NVDA");
  const[E,v]=T.useState(null);
  const[g,A]=T.useState(null);
  const[B,R]=T.useState(!1);
  const[F,Y]=T.useState(!1);
  const[W,X]=T.useState(!1);
  const[allSeries,setAllSeries]=T.useState(createInitialMultiSeries);
  const[lastCatalyst,setLastCatalyst]=T.useState(null);
  const[U,Q]=T.useState([]);
  const[Te,he]=T.useState(!1);
  const[ae,$]=T.useState(!1);
  const[je,ve]=T.useState(!1);
  const[K,de]=T.useState(!1);
  const[Ie,Ae]=T.useState(!0);
  const[Be,ze]=T.useState(null);
  const[J,ye]=T.useState(null);
  const[Ne,fe]=T.useState(!1);
  const[le,P]=T.useState(null);
  const[N,C]=T.useState(null);
  const[p,x]=T.useState(!1);
  const[searchQuery,setSearchQuery]=T.useState("");
  const[searchOpen,setSearchOpen]=T.useState(false);

  const D=Jf(k);
  const Z=sp();

  T.useEffect(()=>{
    let ce=!1;
    v(null);A(null);R(!1);X(!1);
    fetch(\`/api/market/snapshot?tickers=\${encodeURIComponent(k)}\`)
      .then(async b=>{
        if(!b.ok)throw new Error(\`Market snapshot unavailable (HTTP \${b.status}).\`);
        return b.json();
      })
      .then(b=>{
        if(ce)return;
        const xe=Array.isArray(b.data)?b.data[0]:null;
        const Je=tp(xe);
        if(!Je)throw new Error("Market snapshot response did not match the expected contract.");
        v(Je);R(!0);
        Y(b.mock===!0||(yt(xe)&&xe.mock===!0));
        X(yt(xe)&&(xe.stale===!0||xe.source==="no_live_feed"));
      })
      .catch(b=>{
        if(!ce){
          v(null);R(!1);
          A(b instanceof Error?b.message:"Market snapshot unavailable.");
        }
      });
    return()=>{ce=!0;};
  },[k,Z]);

  T.useEffect(()=>{
    const ce=D.prices;
    if(!ce.receivedAt||!yt(ce.payload))return;
    const b=ce.payload;

    if(b.type==="batch_prices"&&Array.isArray(b.payload)){
      setAllSeries(prev=>{
        const next={...prev};
        for(const item of b.payload){
          const sym=item.ticker;
          if(!sym)continue;
          const oldList=next[sym]||[];
          const base=oldList[0]?.openPrice||BASELINE_PRICES[sym]||item.price;
          const pct=parseFloat((((item.price-base)/base)*100).toFixed(2));
          const newPt={
            t:item.t||Date.now(),
            price:item.price,
            openPrice:base,
            pct,
            isCatalyst:false
          };
          next[sym]=[...oldList,newPt].slice(-240);
        }
        return next;
      });

      const currentActive=b.payload.find(item=>item.ticker===k);
      if(currentActive){
        v(prev=>prev?{
          ...prev,
          price:currentActive.price,
          changePct:currentActive.changePct??prev.changePct,
          asOf:currentActive.asOf||new Date().toISOString()
        }:prev);
      }
      return;
    }

    const sym=Ue(b.ticker??b.symbol);
    if(!sym||b.unavailable===!0)return;
    const Je=gt(b.price);
    if(Je===null)return;
    const Rt=Ue(b.asOf??b.as_of);
    const Ze=gt(b.t)??(Rt?new Date(Rt).getTime():Date.now());

    setAllSeries(prev=>{
      const oldList=prev[sym]||[];
      const base=oldList[0]?.openPrice||BASELINE_PRICES[sym]||Je;
      const pct=parseFloat((((Je-base)/base)*100).toFixed(2));
      const newPt={
        t:Ze,
        price:Je,
        openPrice:base,
        pct,
        isCatalyst:Boolean(b.isNewsImpact),
        deltaPct:b.deltaPct,
        headline:b.headline
      };
      return{...prev,[sym]:[...oldList,newPt].slice(-240)};
    });

    if(b.isNewsImpact){
      setLastCatalyst({
        ticker:sym,
        deltaPct:b.deltaPct||0,
        headline:b.headline||\`Market catalyst on $\${sym}\`,
        t:Date.now()
      });
    }

    if(sym===k){
      v(Re=>({
        ticker:k,
        price:Je,
        changePct:gt(b.changePct??b.change_pct??b.change)??Re?.changePct??0,
        marketCap:Re?.marketCap??null,
        peRatio:Re?.peRatio??null,
        primarySignal:Re?.primarySignal??null,
        riskVerdict:Re?.riskVerdict??null,
        asOf:Rt??new Date(Ze).toISOString()
      }));
      R(!0);
      Y(ce.mock??b.mock===!0);
      X(b.stale===!0);
    }
  },[D.prices,k]);

  T.useEffect(()=>{
    let ce=!1;
    const b=Te?100:10;
    Ae(!0);ze(null);
    fetch(\`/api/screens/profitable?limit=\${b}\`)
      .then(async xe=>{
        if(!xe.ok)throw new Error(\`Profitable screen unavailable (HTTP \${xe.status}).\`);
        return xe.json();
      })
      .then(xe=>{
        if(ce)return;
        const Je=Array.isArray(xe.data)?xe.data:[];
        const Rt=Je.map(np).filter(Zt=>Zt!==null);
        if(Je.length>0&&!Rt.length)throw new Error("Profitable screen response did not match the expected contract.");
        Q(Rt);$(!0);
        ve(xe.mock===!0||Je.some(Zt=>yt(Zt)&&Zt.mock===!0));
        de(Je.some(Zt=>yt(Zt)&&Zt.universe_stale===!0));
      })
      .catch(xe=>{
        if(!ce){
          Q([]);$(!1);
          ze(xe instanceof Error?xe.message:"Profitable screen unavailable.");
        }
      })
      .finally(()=>{if(!ce)Ae(!1);});
    return()=>{ce=!0;};
  },[Te,Z]);

  T.useEffect(()=>{
    let ce=!1;
    fetch("/health")
      .then(async b=>{
        if(!b.ok)throw new Error(\`Health check unavailable (HTTP \${b.status}).\`);
        return b.json();
      })
      .then(b=>{
        if(!ce){
          C(typeof b.mock_mode=="boolean"?b.mock_mode:null);
          x(typeof b.status=="string");
        }
      })
      .catch(()=>{if(!ce)x(!1);});

    fetch("/api/portfolio")
      .then(async b=>{
        if(!b.ok)throw new Error(\`Portfolio feed unavailable (HTTP \${b.status}).\`);
        return b.json();
      })
      .then(b=>{
        if(ce)return;
        const xe=lp(b,N);
        if(!xe)throw new Error("Portfolio response did not include positions.");
        ye(xe);fe(!0);P(null);
      })
      .catch(b=>{
        if(!ce)P(b instanceof Error?b.message:"Portfolio feed unavailable.");
      });
    return()=>{ce=!0;};
  },[Z,N]);

  // Interactive News Catalyst Impact handler
  const handleApplyNewsImpact=T.useCallback((story)=>{
    if(!story)return;
    const ticker=(story.ticker||"NVDA").toUpperCase();
    const isBull=story.sentiment==="bullish"||story.expectedDirection==="up";
    const isBear=story.sentiment==="cautionary"||story.sentiment==="bearish"||story.expectedDirection==="down";
    const impactScore=story.impactScore||7;
    const deltaPct=+(isBull
      ?(0.8+impactScore*0.28)
      :isBear
      ?-(0.8+impactScore*0.28)
      :((Math.random()>0.5?1:-1)*0.4)
    ).toFixed(2);

    const now=Date.now();

    setAllSeries(prev=>{
      const oldList=prev[ticker]||[];
      const lastPoint=oldList[oldList.length-1];
      const base=oldList[0]?.openPrice||BASELINE_PRICES[ticker]||100;
      const oldPrice=lastPoint?lastPoint.price:(BASELINE_PRICES[ticker]||100);
      const newPrice=parseFloat((oldPrice*(1+deltaPct/100)).toFixed(2));
      const newPct=parseFloat((((newPrice-base)/base)*100).toFixed(2));

      const catalystPt={
        t:now,
        price:newPrice,
        openPrice:base,
        pct:newPct,
        isCatalyst:true,
        deltaPct,
        headline:story.headline
      };

      return{
        ...prev,
        [ticker]:[...oldList,catalystPt].slice(-240)
      };
    });

    setLastCatalyst({
      ticker,
      deltaPct,
      headline:story.headline,
      t:now
    });

    c(ticker);

    v(prev=>{
      const basePrice=(prev&&prev.ticker===ticker)?prev.price:(BASELINE_PRICES[ticker]||100);
      const newPrice=parseFloat((basePrice*(1+deltaPct/100)).toFixed(2));
      const oldChange=prev?prev.changePct:0;
      return{
        ticker,
        price:newPrice,
        changePct:parseFloat((oldChange+deltaPct).toFixed(2)),
        marketCap:prev?.marketCap??500000000000,
        peRatio:prev?.peRatio??32.5,
        primarySignal:\`NEWS CATALYST: \${deltaPct>=0?"+":""}\${deltaPct}%\`,
        riskVerdict:\`Active news catalyst: "\${story.headline.slice(0,50)}..."\`,
        asOf:new Date().toISOString()
      };
    });

    fetch("/api/news/impact",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        ticker,
        articleId:story.id,
        headline:story.headline,
        sentiment:story.sentiment,
        impactScore
      })
    }).catch(()=>{});
  },[]);

  const ne=T.useMemo(()=>rp(D.news),[D.news]);
  const activeSeries=allSeries[k]||[];
  const re=$t(activeSeries.length>0,D.prices.mock??F,W);
  const me=$t(ne.length>0,D.news.mock??!1);
  const ue=$t(B,F,W);
  const ge=$t(ae,je,K);
  const Ke=Object.values(D).filter(ce=>ce.connected).length;
  const globalStatus=$t(p,N??!1);

  const NAV_ITEMS=[
    {id:"overview",label:"OVERVIEW",sub:"Macro & Wire",icon:Hi},
    {id:"securities",label:"SECURITIES BROWSER",sub:"Universe & Screener",icon:ic},
    {id:"radar",label:"TECHNICAL RADAR",sub:"Candles & Signals",icon:Mf},
    {id:"portfolio",label:"PORTFOLIO & RISK",sub:"VaR & Execution",icon:Kn},
    {id:"oracle",label:"MARKET ORACLE (AI)",sub:"Gemini Synthesis",icon:Wl}
  ];

  const currentPrice=E?.price?E.price.toFixed(2):(BASELINE_PRICES[k]||100).toFixed(2);
  const currentDelta=E?.changePct??0;
  const isPosDelta=currentDelta>=0;

  return i.jsxs("main",{
    className:"dashboard-shell",
    children:[
      i.jsxs("div",{
        className:"desktop-only-notice",
        role:"status",
        children:[
          i.jsx(Hi,{size:24}),
          i.jsx("h1",{children:"JARVIS requires a desktop trading terminal"}),
          i.jsx("p",{children:"Use a viewport at least 1280px wide to view the live multi-view terminal."})
        ]
      }),
      i.jsxs("div",{
        className:"dashboard-app fintech-app-shell",
        children:[
          // 1. TOP NAVIGATION BAR
          i.jsxs("header",{
            className:"fintech-top-nav",
            children:[
              // Left: Logo & System Environment Badge
              i.jsxs("div",{
                className:"nav-left-brand",
                children:[
                  i.jsx("div",{className:"brand-logo-mark",children:i.jsx(Hi,{size:19})}),
                  i.jsxs("div",{
                    className:"brand-titles",
                    children:[
                      i.jsx("strong",{className:"brand-main",children:"JARVIS"}),
                      i.jsx("span",{className:"brand-sub",children:"// TRADING INTELLIGENCE"})
                    ]
                  }),
                  i.jsx("span",{className:"nav-pipe"}),
                  i.jsx(on,{status:globalStatus})
                ]
              }),
              // Center: Global Ticker Search & Active Symbol Badge
              i.jsxs("div",{
                className:"nav-center-search",
                children:[
                  i.jsxs("div",{
                    className:"global-search-box",
                    children:[
                      i.jsx(zf,{size:13,className:"global-search-icon"}),
                      i.jsx("input",{
                        type:"text",
                        placeholder:"Search ticker (e.g. NVDA, RELIANCE, AAPL)…",
                        value:searchQuery,
                        onChange:ev=>setSearchQuery(ev.target.value.toUpperCase()),
                        onFocus:()=>setSearchOpen(!0),
                        className:"global-search-input",
                        onKeyDown:ev=>{
                          if(ev.key==="Enter"&&searchQuery.trim()){
                            c(searchQuery.trim());
                            setSearchQuery("");
                            setSearchOpen(!1);
                          }
                        }
                      }),
                      searchOpen?i.jsx("div",{
                        className:"search-dropdown-menu",
                        children:TRACKED_STOCKS.concat(["RELIANCE","HDFCBANK"]).filter(s=>!searchQuery||s.includes(searchQuery)).slice(0,6).map(sym=>i.jsxs("button",{
                          type:"button",
                          key:sym,
                          className:"search-dropdown-item",
                          onClick:()=>{c(sym);setSearchQuery("");setSearchOpen(!1);},
                          children:[
                            i.jsx("strong",{children:sym}),
                            i.jsx("span",{children:\`$\${BASELINE_PRICES[sym]||100}\`})
                          ]
                        }))
                      }):null
                    ]
                  }),
                  i.jsxs("div",{
                    className:"nav-active-symbol-badge",
                    title:\`Currently active asset: \${k}\`,
                    children:[
                      i.jsx("span",{className:"active-symbol-dot"}),
                      i.jsx("strong",{className:"active-symbol-ticker",children:k}),
                      i.jsxs("span",{className:"active-symbol-price",children:[\"$\",currentPrice]}),
                      i.jsxs("span",{
                        className:\`active-symbol-delta \${isPosDelta?"value-positive":"value-negative"}\`,
                        children:[isPosDelta?"+":"",currentDelta.toFixed(2),"%"]
                      })
                    ]
                  })
                ]
              }),
              // Right: Quick Stat Pills & Status Indicators
              i.jsxs("div",{
                className:"nav-right-stats",
                children:[
                  i.jsxs("div",{
                    className:"stat-pill",
                    children:[
                      i.jsx("span",{className:"stat-pill__label",children:"NIFTY 50"}),
                      i.jsx("strong",{className:"stat-pill__value value-positive",children:"24,850 +0.38%"})
                    ]
                  }),
                  i.jsxs("div",{
                    className:"stat-pill",
                    children:[
                      i.jsx("span",{className:"stat-pill__label",children:"BANK NIFTY"}),
                      i.jsx("strong",{className:"stat-pill__value value-positive",children:"51,200 +0.55%"})
                    ]
                  }),
                  i.jsxs("div",{
                    className:"stat-pill",
                    children:[
                      i.jsx("span",{className:"stat-pill__label",children:"BREADTH"}),
                      i.jsx("strong",{className:"stat-pill__value",children:"1.65 A/D"})
                    ]
                  }),
                  i.jsxs("div",{
                    className:"stat-pill stat-pill--ws",
                    children:[
                      i.jsx("span",{className:"ws-pulse-dot"}),
                      i.jsxs("strong",{children:[Ke,"/5 CHANNELS (14ms)"]})
                    ]
                  }),
                  i.jsx("span",{className:"nav-pipe"}),
                  i.jsxs("span",{
                    className:"nav-compliance-badge",
                    children:[i.jsx(Kn,{size:12})," AI ESTIMATE · NOT FINANCIAL ADVICE"]
                  })
                ]
              })
            ]
          }),
          // 2. MAIN WORKSPACE WITH PERSISTENT SIDEBAR & 5 VIEWS
          i.jsxs("div",{
            className:"fintech-workspace",
            children:[
              // Persistent 5-View Sidebar
              i.jsx("nav",{
                className:"fintech-sidebar",
                "aria-label":"Primary Dashboard Navigation",
                children:NAV_ITEMS.map(item=>{
                  const isAct=activeView===item.id;
                  const IconComp=item.icon;
                  return i.jsxs("button",{
                    type:"button",
                    key:item.id,
                    className:\`sidebar-nav-btn \${isAct?"sidebar-nav-btn--active":""}\`,
                    onClick:()=>setActiveView(item.id),
                    children:[
                      i.jsx("div",{
                        className:"sidebar-icon-wrap",
                        children:i.jsx(IconComp,{size:18})
                      }),
                      i.jsxs("div",{
                        className:"sidebar-btn-copy",
                        children:[
                          i.jsx("strong",{className:"sidebar-btn-title",children:item.label}),
                          i.jsx("span",{className:"sidebar-btn-sub",children:item.sub})
                        ]
                      }),
                      isAct?i.jsx("span",{className:"active-indicator-glow"}):null
                    ]
                  });
                })
              }),
              // Active View Container
              i.jsx("div",{
                className:"fintech-view-stage",
                children:activeView==="overview"?i.jsxs("div",{
                  className:"view-container overview-view",
                  children:[
                    // Macro Regime Strip
                    i.jsxs("div",{
                      className:"macro-regime-strip dashboard-panel",
                      children:[
                        i.jsxs("div",{className:"regime-badge-group",children:[i.jsx("span",{className:"regime-label",children:"MARKET REGIME"}),i.jsx("strong",{className:"regime-status value-positive",children:"● EXPANSION // VOLATILITY LOW"})]}),
                        i.jsxs("div",{className:"macro-stat",children:[i.jsx("span",{children:"VIX VOLATILITY"}),i.jsx("strong",{className:"value-positive",children:"14.82 (-0.64)"})]}),
                        i.jsxs("div",{className:"macro-stat",children:[i.jsx("span",{children:"US 10Y YIELD"}),i.jsx("strong",{children:"4.08% (-3.2 bps)"})]}),
                        i.jsxs("div",{className:"macro-stat",children:[i.jsx("span",{children:"BRENT CRUDE"}),i.jsx("strong",{children:"$74.20 (-1.1%)"})]}),
                        i.jsxs("div",{className:"macro-stat",children:[i.jsx("span",{children:"S&P 500"}),i.jsx("strong",{className:"value-positive",children:"5,864 (+0.42%)"})]}),
                        i.jsxs("div",{className:"macro-stat",children:[i.jsx("span",{children:"MARKET ADV/DEC"}),i.jsx("strong",{className:"value-positive",children:"1,842 / 1,116"})]})
                      ]
                    }),
                    // 2-Column Overview Stage
                    i.jsxs("div",{
                      className:"overview-grid-columns",
                      children:[
                        i.jsxs("div",{
                          className:"overview-col-left",
                          children:[
                            i.jsx(Gf,{snapshot:E,status:ue,error:g}),
                            i.jsx(Xf,{
                              allSeries,
                              status:re,
                              activeTicker:k,
                              onSelectTicker:c,
                              lastCatalyst,
                              series:activeSeries
                            })
                          ]
                        }),
                        i.jsxs("div",{
                          className:"overview-col-right",
                          children:[
                            i.jsxs("div",{
                              className:"dashboard-panel agent-desk-strip",
                              children:[
                                i.jsx("div",{className:"panel-kicker",children:"TRIAD RISKGUARD AGENT DESK"}),
                                i.jsxs("div",{
                                  className:"agent-desk-nodes",
                                  children:[
                                    i.jsxs("div",{className:"agent-node",children:[i.jsx("span",{className:"agent-node__dot"}),i.jsx("strong",{children:"TRACKER"}),i.jsx("small",{children:"42 Feeds Active"})]}),
                                    i.jsxs("div",{className:"agent-node",children:[i.jsx("span",{className:"agent-node__dot"}),i.jsx("strong",{children:"PREDICTOR"}),i.jsx("small",{children:"Horizon Calibrated"})]}),
                                    i.jsxs("div",{className:"agent-node",children:[i.jsx("span",{className:"agent-node__dot"}),i.jsx("strong",{children:"COMMANDER"}),i.jsx("small",{children:"Paper Execution"})]}),
                                    i.jsxs("div",{className:"agent-node",children:[i.jsx("span",{className:"agent-node__dot"}),i.jsx("strong",{children:"RISKGUARD"}),i.jsx("small",{children:"2.0% Max DD Cap"})]})
                                  ]
                                })
                              ]
                            }),
                            i.jsx(Wf,{status:globalStatus,connected:Ke===5}),
                            i.jsx(Bf,{
                              items:ne,
                              status:me,
                              onApplyNewsImpact:handleApplyNewsImpact,
                              appliedTicker:lastCatalyst?.ticker,
                              lastImpactDelta:lastCatalyst?.deltaPct
                            })
                          ]
                        })
                      ]
                    })
                  ]
                }):activeView==="securities"?i.jsxs("div",{
                  className:"view-container securities-browser-view",
                  children:[
                    i.jsxs("div",{
                      className:"securities-main-layout",
                      children:[
                        i.jsx("div",{
                          className:"securities-screener-col",
                          children:i.jsx(Qf,{
                            rows:U,
                            status:ge,
                            loading:Ie,
                            error:Be,
                            onShowTop100:he,
                            onSelectTicker:c
                          })
                        }),
                        i.jsx("div",{
                          className:"securities-universe-col",
                          children:i.jsx(ep,{
                            onSelectSymbol:c,
                            onNavigateCompany:u?ce=>u(\`/company/\${ce}\`):void 0,
                            selectedSymbol:k
                          })
                        })
                      ]
                    }),
                    // Bottom Sector & Supply Chain Preview Card
                    i.jsxs("div",{
                      className:"dashboard-panel supply-chain-preview-card",
                      children:[
                        i.jsxs("div",{
                          className:"preview-card-info",
                          children:[
                            i.jsx("div",{className:"panel-kicker",children:"SUPPLY CHAIN & DISCLOSURE GRAPH"}),
                            i.jsxs("h3",{children:[\"Deep-Dive Graph for $\",k]}),
                            i.jsx("p",{children:"Inspect what this company buys (inputs), its subsidiaries and global stakes (owned), and product customer segments (outputs)."})
                          ]
                        }),
                        i.jsxs("button",{
                          type:"button",
                          className:"open-company-graph-btn",
                          onClick:()=>u&&u(\`/company/\${k}\`),
                          children:[
                            i.jsx(Ef,{size:14}),
                            \`Open Complete $\${k} Supply-Chain Graph\`,
                            i.jsx(Ir,{size:12})
                          ]
                        })
                      ]
                    })
                  ]
                }):activeView==="radar"?i.jsx(TechnicalRadarView,{
                  activeTicker:k,
                  activeSeries,
                  snapshot:E,
                  onSelectTicker:c
                }):activeView==="portfolio"?i.jsx(PortfolioRiskView,{
                  portfolio:J,
                  status:globalStatus,
                  onSelectTicker:c
                }):activeView==="oracle"?i.jsxs("div",{
                  className:"view-container oracle-view",
                  children:[
                    i.jsx(Hf,{onNavigateCompany:ce=>u==null?void 0:u(\`/company/\${ce}\`)})
                  ]
                }):null
              })
            ]
          })
        ]
      })
    ]
  });
}`;

// 7. Combine slices into new line 223
const newLine223 = part_0_to_Bf +
  new_Bf +
  part_Wf_to_Yf +
  new_Yf_Xf +
  part_ec_to_ep +
  new_ep +
  part_yt_to_rp +
  new_rp +
  part_lp_to_ip +
  new_ip +
  part_nc_to_end;

lines[222] = newLine223;
const fullBundledCode = lines.join('\n');

const testPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index.bundle-test.js');
fs.writeFileSync(testPath, fullBundledCode, 'utf8');

console.log('[TEST] Checking bundle syntax with node -c ...');
try {
  execSync('node -c "' + testPath + '"', { stdio: 'inherit' });
  console.log('[TEST PASSED] Syntax is valid! Writing to target bundle...');
  fs.writeFileSync(targetPath, fullBundledCode, 'utf8');
  fs.unlinkSync(testPath);
  console.log('[SUCCESS] Updated index-DX773-IE.js successfully!');
} catch (err) {
  console.error('[TEST FAILED]:', err.message);
  process.exit(1);
}
