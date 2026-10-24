const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DX773-IE.js');
const backupPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DX773-IE.js.bak');

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(targetPath, backupPath);
  console.log('[BACKUP] Created backup of index-DX773-IE.js');
}

const originalContent = fs.readFileSync(backupPath, 'utf8');
const lines = originalContent.split('\n');

const line223 = lines[222];

// Exact validated boundaries:
const prefix_0_to_5379 = line223.substring(0, 5379);
const middle_6240_to_12174 = line223.substring(6240, 12174);
const middle_13675_to_19822 = line223.substring(13675, 19822);
const middle_20125_to_20680 = line223.substring(20125, 20680);
const suffix_25907_to_end = line223.substring(25907);

// New Bf: news panel with sentiment & live stock price / graph catalyst impact
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
            i.jsx("div",{className:"panel-kicker",children:"WIRE MONITOR · IMPACT INTEGRATED"}),
            i.jsxs("h2",{children:[i.jsx(Pf,{size:15})," Market news & Catalysts"]})
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
                  title:\`Apply news catalyst directly to \${c.ticker} stock price & graph\`,
                  children:[
                    i.jsx(Mf,{size:11}),
                    isApplied?"✓ Impact Applied":\`Affect $\${c.ticker} Price\`
                  ]
                })
              ]
            })
          ]
        },\`\${c.ticker}-\${c.publishedAt}-\${E}\`);
      }):i.jsx("div",{className:"empty-state",children:"No news items have resolved from the news feed."})
    })
  ]
})}`;

// New Yf and Xf: Multi-Stock Simultaneous Intraday Graph
const new_Yf_Xf = `const TRACKED_STOCKS=["NVDA","MSFT","AAPL","GOOGL","AMZN","META","TSLA","PLTR","TSM","AMD"];
const STOCK_COLORS={
  NVDA:"#22d3ee",
  MSFT:"#38bdf8",
  AAPL:"#f1f5f9",
  GOOGL:"#fbbf24",
  AMZN:"#fb923c",
  META:"#c084fc",
  TSLA:"#f43f5e",
  PLTR:"#34d399",
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
  const W=460,H=140;
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
      color:STOCK_COLORS[sym]||"#22d3ee",
      lastPrice:lastPt.price,
      lastPct:lastPt.pct
    });
  }

  const rangeMin=Math.min(-2,globalMinPct-0.4);
  const rangeMax=Math.max(2,globalMaxPct+0.4);
  const range=rangeMax-rangeMin||1;
  const getY=pct=>H-12-((pct-rangeMin)/range)*(H-26);
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
  const activeColor=activeStock?activeStock.color:"#22d3ee";

  return i.jsxs("section",{
    className:"dashboard-panel graph-panel multi-stock-panel",
    "aria-label":"Live multi-asset price graph",
    children:[
      i.jsxs("header",{
        className:"panel-header",
        children:[
          i.jsxs("div",{
            children:[
              i.jsx("div",{className:"panel-kicker",children:"MULTI-STREAM PRICE ENGINE"}),
              i.jsxs("h2",{children:["Simultaneous Intraday Grid (",renderedLines.length," Assets)"]})
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
              (lastCatalyst.headline||"").slice(0,50),
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
                    id:"active-fill",
                    x1:"0",x2:"0",y1:"0",y2:"1",
                    children:[
                      i.jsx("stop",{offset:"0%",stopColor:activeColor,stopOpacity:".22"}),
                      i.jsx("stop",{offset:"100%",stopColor:activeColor,stopOpacity:"0"})
                    ]
                  })
                ]
              }),
              i.jsx("line",{
                x1:"12",y1:yZero,x2:W-12,y2:yZero,
                stroke:"rgba(255,255,255,0.14)",
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
                opacity:".55",
                vectorEffect:"non-scaling-stroke",
                style:{cursor:"pointer"},
                onClick:()=>onSelect(l.ticker)
              })),
              activeStock?i.jsxs(i.Fragment,{
                children:[
                  i.jsx("path",{
                    d:\`\${activeStock.pathD} L\${activeStock.lastX},\${H-4} L14,\${H-4} Z\`,
                    fill:"url(#active-fill)"
                  }),
                  i.jsx("path",{
                    d:activeStock.pathD,
                    fill:"none",
                    stroke:activeStock.color,
                    strokeWidth:"2.8",
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
                  i.jsx("circle",{cx:cat.x,cy:cat.y,r:"4.5",fill:cat.color}),
                  i.jsx("circle",{cx:cat.x,cy:cat.y,r:"9",fill:"none",stroke:cat.color,strokeWidth:"1.5",opacity:".7"}),
                  i.jsx("text",{
                    x:cat.x,y:Math.max(9,cat.y-7),
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
              const color=STOCK_COLORS[sym]||"#22d3ee";
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
                title:\`Highlight \${sym} multi-stream curve\`,
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
              " simultaneous streams · focus: ",
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

// New rp: rich news parser
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

// New ip: main terminal component
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
  NFLX:685.2
};

function createInitialMultiSeries(){
  const now=Date.now();
  const res={};
  for(const sym of TRACKED_STOCKS){
    const base=BASELINE_PRICES[sym]||100;
    const pts=[];
    const stepMs=60000;
    let curr=base*(1-(Math.random()*0.015-0.007));
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

function ip({navigate:u}){
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

  // Interactive News Catalyst Impact handler: only effects stock price & stock graph!
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

  return i.jsxs("main",{
    className:"dashboard-shell",
    children:[
      i.jsxs("div",{
        className:"desktop-only-notice",
        role:"status",
        children:[
          i.jsx(Hi,{size:24}),
          i.jsx("h1",{children:"JARVIS requires a desktop trading terminal"}),
          i.jsx("p",{children:"Use a viewport at least 1280px wide to view the live dashboard."})
        ]
      }),
      i.jsxs("div",{
        className:"dashboard-app",
        children:[
          i.jsxs("header",{
            className:"terminal-header",
            children:[
              i.jsxs("div",{
                className:"terminal-brand",
                children:[
                  i.jsx("div",{className:"brand-mark",children:i.jsx(Hi,{size:18})}),
                  i.jsxs("div",{
                    children:[
                      i.jsx("strong",{children:"JARVIS"}),
                      i.jsx("span",{children:"TRADING INTELLIGENCE"})
                    ]
                  })
                ]
              }),
              i.jsxs("div",{
                className:"terminal-session",
                children:[
                  i.jsxs("span",{
                    className:"connection-indicator",
                    children:[
                      i.jsx("i",{}),
                      " ",
                      Ke,
                      "/5 CHANNELS"
                    ]
                  }),
                  i.jsx("span",{className:"header-divider"}),
                  i.jsxs("span",{
                    children:[
                      i.jsx(Kn,{size:14}),
                      " AI ESTIMATE · NOT FINANCIAL ADVICE"
                    ]
                  })
                ]
              }),
              i.jsx("div",{className:"terminal-clock",children:new Date().toLocaleDateString()})
            ]
          }),
          i.jsxs("div",{
            className:"dashboard-grid",
            children:[
              i.jsxs("aside",{
                className:"dashboard-column dashboard-column--left",
                children:[
                  i.jsx(Wf,{status:$t(p,N??!1),connected:Ke===5}),
                  i.jsx(ep,{
                    onSelectSymbol:c,
                    onNavigateCompany:u?ce=>u(\`/company/\${ce}\`):void 0,
                    selectedSymbol:k
                  }),
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
              i.jsx("section",{
                className:"dashboard-column dashboard-column--center",
                children:i.jsx(Qf,{
                  rows:U,
                  status:ge,
                  loading:Ie,
                  error:Be,
                  onShowTop100:he,
                  onSelectTicker:c
                })
              }),
              i.jsxs("aside",{
                className:"dashboard-column dashboard-column--right",
                children:[
                  i.jsx(Bf,{
                    items:ne,
                    status:me,
                    onApplyNewsImpact:handleApplyNewsImpact,
                    appliedTicker:lastCatalyst?.ticker,
                    lastImpactDelta:lastCatalyst?.deltaPct
                  }),
                  i.jsx(Hf,{onNavigateCompany:ce=>u==null?void 0:u(\`/company/\${ce}\`)})
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}`;

// Combine into new line 223
const newLine223 = prefix_0_to_5379 +
  new_Bf +
  middle_6240_to_12174 +
  new_Yf_Xf +
  middle_13675_to_19822 +
  new_rp +
  middle_20125_to_20680 +
  new_ip +
  suffix_25907_to_end;

lines[222] = newLine223;
const fullBundledCode = lines.join('\n');

const testPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index.test.js');
fs.writeFileSync(testPath, fullBundledCode, 'utf8');

console.log('[SYNTAX TEST] Checking bundle syntax with node -c ...');
try {
  execSync(`node -c "${testPath}"`, { stdio: 'inherit' });
  console.log('[SYNTAX TEST] Passed! Replacing index-DX773-IE.js with new bundle...');
  fs.writeFileSync(targetPath, fullBundledCode, 'utf8');
  fs.unlinkSync(testPath);
  console.log('[SUCCESS] Successfully updated index-DX773-IE.js!');
} catch (err) {
  console.error('[SYNTAX TEST FAILED]:', err.message);
  process.exit(1);
}
