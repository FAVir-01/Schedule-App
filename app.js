import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, TextInput, Pressable, ScrollView, Alert, Switch, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch (err) {
  // ambiente sem suporte a notificações
}

/* ---------------------- tema e utilidades ---------------------- */
const THEMES = {
  midnight: { bg:"#0B1220", card:"#11192b", txt:"#E7ECF5", sub:"#9FB0C9", acc:"#5B8CFF", good:"#18C08F", warn:"#FFB020", bad:"#FF6B6B", chip:"#1a263e", brd:"#23324a", dim:"#1b2945", dimStrong:"#0f182b" },
  forest: { bg:"#0F1612", card:"#152018", txt:"#E9F5ED", sub:"#9EC5AC", acc:"#57D399", good:"#7FFFD4", warn:"#FFD66B", bad:"#FF7F7F", chip:"#1B2A1F", brd:"#1F3225", dim:"#1a2c20", dimStrong:"#14231b" },
  sunrise: { bg:"#1A1627", card:"#221B33", txt:"#F6EEFF", sub:"#B9A9D6", acc:"#FF7AD6", good:"#8FFFC2", warn:"#FFD37D", bad:"#FF6B91", chip:"#2B2240", brd:"#352D4F", dim:"#2d2545", dimStrong:"#251d3a" },
};
const ThemeContext = React.createContext({ colors: THEMES.midnight, themeName: "midnight", setThemeName: ()=>{} });
const useTheme = () => useContext(ThemeContext);
const useColors = () => useTheme().colors;
const P = 16;
const monthNamesShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const uid = () => Math.random().toString(36).slice(2,10);
const clamp = (n, a, b) => Math.max(a, Math.min(n, b));
const fmtHM = (mins)=>`${Math.floor(Math.abs(mins)/60)}h ${Math.abs(mins)%60}m${mins<0?" (-)":""}`;
const weekStart = (d=new Date()) => { const x=new Date(d); const g=x.getDay(); const diff=(g===0?-6:1)-g; x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x; };
const addDays = (value, amount)=>{
  const base = new Date(value);
  if (!Number.isFinite(amount) || !base.getTime()) return new Date(base.getTime());
  base.setDate(base.getDate() + amount);
  return base;
};
const normalizeDate = (value)=>{ const ref=new Date(value||new Date()); ref.setHours(0,0,0,0); return ref; };
const isSameWeek = (a,b)=> weekStart(normalizeDate(a)).getTime() === weekStart(normalizeDate(b)).getTime();
const shortDow = ["M","T","W","T","F","S","S"]; // monday..sunday
const shortDowPt = ["S","T","Q","Q","S","S","D"]; // segunda..domingo
const monthDay = (d)=>{const x=new Date(d); return ("0"+x.getDate()).slice(-2)+"/"+("0"+(x.getMonth()+1)).slice(-2);};

const hexToRgba = (hex, alpha=1)=>{
  const fallback = THEMES.midnight.acc || "#5B8CFF";
  const raw = typeof hex === "string" ? hex.trim() : "";
  const candidate = raw ? raw.replace("#","") : "";
  const base = candidate.length===3 || candidate.length===6
    ? candidate
    : fallback.replace("#","");
  const size = base.length===3 ? 1 : 2;
  const parse = (start)=>{
    const segment = base.substr(start, size);
    const full = size===1 ? segment.repeat(2) : segment;
    return parseInt(full,16)||0;
  };
  const r = parse(0);
  const g = parse(size);
  const b = parse(size*2);
  return `rgba(${r},${g},${b},${alpha})`;
};

const Card = ({children,style}) => {
  const C = useColors();
  return <View style={[{backgroundColor:C.card,borderRadius:18,padding:14,borderWidth:1,borderColor:C.brd},style]}>{children}</View>;
};
const Btn = ({title,onPress,kind="primary",style,disabled})=>{
  const C = useColors();
  const map={primary:C.acc, good:C.good, danger:C.bad, chip:C.chip};
  const bg = map[kind] || C.acc;
  const inactive = disabled ? C.dim : bg;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={!!disabled}
      style={({pressed})=>[
        {
          backgroundColor: inactive,
          opacity: disabled ? 0.6 : (pressed ? 0.9 : 1),
          paddingVertical:12,
          paddingHorizontal:16,
          borderRadius:12,
          alignItems:"center",
        },
        style,
      ]}
    >
      <Text style={{color: disabled ? C.sub : "white", fontWeight:"800"}}>{title}</Text>
    </Pressable>
  );
};
const Tag = ({active,label,onPress})=>{
  const C = useColors();
  return (
    <Pressable onPress={onPress} style={({pressed})=>({backgroundColor:active?C.acc:(pressed?hexToRgba(C.acc,0.1):C.chip), paddingVertical:8, paddingHorizontal:12, borderRadius:12, borderWidth:1, borderColor:active?C.acc:C.brd})}>
      <Text style={{color:active?"white":C.txt, fontWeight:"800"}}>{label}</Text>
    </Pressable>
  );
};
const Chip = ({title,onPress}) => {
  const C = useColors();
  return (
    <Pressable onPress={onPress} style={({pressed})=>({backgroundColor:pressed?hexToRgba(C.acc,0.12):C.chip, paddingVertical:8, paddingHorizontal:10, borderRadius:10, borderWidth:1, borderColor:C.brd})}>
      <Text style={{color:C.txt, fontWeight:"700"}}>{title}</Text>
    </Pressable>
  );
};
const OptionPill = ({active,label,onPress,color,style}) => {
  const C = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({pressed})=>[
        {
          paddingVertical:6,
          paddingHorizontal:14,
          borderRadius:999,
          backgroundColor: active ? hexToRgba(color||C.acc,0.16) : pressed ? C.dim : C.card,
          borderWidth:1,
          borderColor: active ? color||C.acc : C.brd,
        },
        style,
      ]}
    >
      <Text style={{color: active ? (color||C.acc) : C.sub, fontWeight:"700", fontSize:12}}>{label}</Text>
    </Pressable>
  );
};
const DayPeriodChart = ({ data = [], height = 140 }) => {
  const C = useColors();
  const safeData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map((item, index) => ({
      key: item?.key || String(index),
      label: item?.label || String(index + 1),
      value: Math.max(0, Number(item?.value) || 0),
      color: item?.color || C.acc,
    }));
  }, [data, C.acc]);

  const maxValue = useMemo(() => {
    const values = safeData.map(item => item.value);
    const highest = values.length ? Math.max(...values) : 0;
    return highest > 0 ? highest : 1;
  }, [safeData]);

  const chartHeight = Math.max(48, height - 28);

  return (
    <View style={{ height }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 6 }}>
        {safeData.map((item, index) => {
          const ratio = item.value / maxValue;
          const barHeight = Math.max(8, ratio * chartHeight);
          return (
            <View key={item.key || index} style={{ flex: 1, alignItems: "center", paddingHorizontal: 6 }}>
              <View style={{ height: chartHeight, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
                <View
                  style={{
                    height: barHeight,
                    width: "70%",
                    backgroundColor: item.color,
                    borderRadius: 12,
                    shadowColor: item.color,
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 3,
                  }}
                />
              </View>
              <Text style={{ color: C.txt, fontWeight: "800", fontSize: 12, marginTop: 8 }}>{fmtHM(item.value)}</Text>
              <Text style={{ color: C.sub, fontSize: 11, marginTop: 4, textAlign: "center" }}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const TrendChart = ({series,color,height=160})=>{
  const C = useColors();
  const accent = color || C.acc;
  const [width, setWidth] = useState(0);
  const data = Array.isArray(series) ? series : [];
  const topPadding = 12;
  const bottomPadding = 24;
  const chartHeight = Math.max(40, height - topPadding - bottomPadding);
  const maxVal = Math.max(...data.map(p=>p.value||0), 1);
  const points = useMemo(()=>{
    if (!width || data.length === 0) return [];
    const step = data.length === 1 ? 0 : width/(data.length-1);
    return data.map((point, index)=>{
      const ratio = maxVal === 0 ? 0 : (point.value||0)/maxVal;
      const x = data.length === 1 ? width/2 : index*step;
      const y = topPadding + (1 - ratio) * chartHeight;
      return { x, y, value: point.value||0, label: point.label };
    });
  }, [width, data, maxVal, chartHeight]);
  const baseline = topPadding + chartHeight;
  const segments = useMemo(()=>{
    const list = [];
    for (let i=0;i<points.length-1;i++){
      const start = points[i];
      const end = points[i+1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx*dx + dy*dy) || 0;
      const angle = Math.atan2(dy, dx) * 180/Math.PI;
      list.push({ start, end, dx, dy, length, angle });
    }
    return list;
  }, [points]);

  return (
    <View>
      <View
        style={{height, position:"relative", overflow:"hidden"}}
        onLayout={(e)=>setWidth(e.nativeEvent.layout.width)}
      >
        {[0.25,0.5,0.75,1].map((ratio,index)=>(
          <View
            key={index}
            style={{
              position:"absolute",
              left:0,
              right:0,
              top: topPadding + (1-ratio)*chartHeight,
              borderBottomWidth:1,
              borderBottomColor: ratio===1?C.dim:"#16223a",
            }}
          />
        ))}
        {segments.map((seg,index)=>(
          <View
            key={`area-${index}`}
            style={{
              position:"absolute",
              left: seg.start.x,
              width: Math.max(2, seg.dx),
              bottom: bottomPadding,
              height: Math.max(2, baseline - Math.min(seg.start.y, seg.end.y)),
              backgroundColor: hexToRgba(accent, 0.16),
              borderTopLeftRadius:12,
              borderTopRightRadius:12,
            }}
          />
        ))}
        {segments.map((seg,index)=>(
          <View
            key={`line-${index}`}
            style={{
              position:"absolute",
              left: seg.start.x,
              top: seg.start.y,
              width: seg.length,
              height:4,
              backgroundColor: accent,
              borderRadius:999,
              shadowColor: accent,
              shadowOpacity:0.25,
              shadowRadius:6,
              shadowOffset:{width:0,height:4},
              elevation:3,
              transform:[{translateY:-2},{rotate:`${seg.angle}deg`}],
            }}
          />
        ))}
        {points.map((pt,index)=>(
          <View key={`dot-${index}`} style={{position:"absolute", left:pt.x-5, top:pt.y-5}}>
            <View style={{width:10, height:10, borderRadius:5, backgroundColor:accent}} />
            <View style={{position:"absolute", width:6, height:6, borderRadius:3, backgroundColor:C.card, left:2, top:2}} />
          </View>
        ))}
      </View>
      <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:6}}>
        {data.map((point,index)=>(
          <View key={index} style={{flex:1, alignItems:"center"}}>
            <Text style={{color:C.sub, fontSize:10}}>{point.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const WeeklyCompareChart = ({ labels=[], current=[], previous=[], height=160, color, previousColor }) => {
  const C = useColors();
  const accent = color || C.acc;
  const compareColor = previousColor || C.sub;
  const compareStroke = useMemo(()=>hexToRgba(compareColor, 0.75), [compareColor]);
  const compareFill = useMemo(()=>hexToRgba(compareColor, 0.18), [compareColor]);
  const [width, setWidth] = useState(0);
  const topPadding = 12;
  const bottomPadding = 28;
  const chartHeight = Math.max(40, height - topPadding - bottomPadding);

  const normalizedLabels = useMemo(()=>{
    if (Array.isArray(labels) && labels.length > 0) return labels;
    const count = Math.max(Array.isArray(current) ? current.length : 0, Array.isArray(previous) ? previous.length : 0);
    if (count === 0) return [];
    return Array.from({length: count}, (_, idx)=>String(idx+1));
  }, [labels, current, previous]);

  const safeCurrent = useMemo(()=>{
    return normalizedLabels.map((_, idx)=>{
      const value = Array.isArray(current) ? Number(current[idx]||0) : 0;
      return value > 0 ? value : 0;
    });
  }, [normalizedLabels, current]);

  const safePrevious = useMemo(()=>{
    return normalizedLabels.map((_, idx)=>{
      const value = Array.isArray(previous) ? Number(previous[idx]||0) : 0;
      return value > 0 ? value : 0;
    });
  }, [normalizedLabels, previous]);

  const maxVal = useMemo(()=>{
    const combined = [...safeCurrent, ...safePrevious];
    const highest = combined.length ? Math.max(...combined) : 0;
    return highest > 0 ? highest : 1;
  }, [safeCurrent, safePrevious]);

  const computePoints = useCallback((values)=>{
    if (!width || !values.length) return [];
    const step = values.length === 1 ? 0 : width/(values.length-1);
    return values.map((value, index)=>{
      const ratio = maxVal === 0 ? 0 : value/maxVal;
      const x = values.length === 1 ? width/2 : index*step;
      const y = topPadding + (1 - ratio) * chartHeight;
      return { x, y, value };
    });
  }, [width, maxVal, chartHeight]);

  const currentPoints = useMemo(()=>computePoints(safeCurrent), [computePoints, safeCurrent]);
  const previousPoints = useMemo(()=>computePoints(safePrevious), [computePoints, safePrevious]);

  const makeSegments = (points)=>{
    const list = [];
    for (let i=0;i<points.length-1;i++){
      const start = points[i];
      const end = points[i+1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx*dx + dy*dy) || 0;
      const angle = Math.atan2(dy, dx) * 180/Math.PI;
      list.push({ start, end, dx, dy, length, angle });
    }
    return list;
  };

  const currentSegments = useMemo(()=>makeSegments(currentPoints), [currentPoints]);
  const previousSegments = useMemo(()=>makeSegments(previousPoints), [previousPoints]);
  const baseline = topPadding + chartHeight;

  return (
    <View>
      <View
        style={{height, position:"relative", overflow:"hidden"}}
        onLayout={(e)=>setWidth(e.nativeEvent.layout.width)}
      >
        {[0.25,0.5,0.75,1].map((ratio,index)=>(
          <View
            key={`grid-${index}`}
            style={{
              position:"absolute",
              left:0,
              right:0,
              top: topPadding + (1-ratio)*chartHeight,
              borderBottomWidth:1,
              borderBottomColor: ratio===1 ? C.dim : hexToRgba(C.brd,0.5),
            }}
          />
        ))}
        {currentSegments.map((seg,index)=>{
          if (seg.length <= 0) return null;
          return (
            <View
              key={`fill-${index}`}
              style={{
                position:"absolute",
                left: seg.start.x,
                width: Math.max(2, seg.dx),
                bottom: bottomPadding,
                height: Math.max(2, baseline - Math.min(seg.start.y, seg.end.y)),
                backgroundColor: hexToRgba(accent, 0.12),
              }}
            />
          );
        })}
        {previousSegments.map((seg,index)=>{
          if (seg.length <= 0) return null;
          return (
            <View
              key={`prev-line-${index}`}
              style={{
                position:"absolute",
                left: seg.start.x,
                top: seg.start.y,
                width: seg.length,
                borderTopWidth:2,
                borderColor: compareStroke,
                borderStyle:"dashed",
                opacity:0.8,
                transform:[{translateY:-1},{rotate:`${seg.angle}deg`}],
              }}
            />
          );
        })}
        {currentSegments.map((seg,index)=>{
          if (seg.length <= 0) return null;
          return (
            <View
              key={`curr-line-${index}`}
              style={{
                position:"absolute",
                left: seg.start.x,
                top: seg.start.y,
                width: seg.length,
                height:4,
                backgroundColor: accent,
                borderRadius:999,
                shadowColor: accent,
                shadowOpacity:0.2,
                shadowRadius:5,
                shadowOffset:{width:0,height:4},
                elevation:3,
                transform:[{translateY:-2},{rotate:`${seg.angle}deg`}],
              }}
            />
          );
        })}
        {previousPoints.map((pt,index)=>(
          <View key={`prev-dot-${index}`} style={{position:"absolute", left:pt.x-5, top:pt.y-5}}>
            <View style={{width:10, height:10, borderRadius:5, borderWidth:2, borderColor:compareStroke, backgroundColor:compareFill}} />
          </View>
        ))}
        {currentPoints.map((pt,index)=>(
          <View key={`curr-dot-${index}`} style={{position:"absolute", left:pt.x-5, top:pt.y-5}}>
            <View style={{width:10, height:10, borderRadius:5, backgroundColor:accent}} />
            <View style={{position:"absolute", width:6, height:6, borderRadius:3, backgroundColor:C.card, left:2, top:2}} />
          </View>
        ))}
      </View>
      <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:6}}>
        {normalizedLabels.map((label,index)=>(
          <View key={`label-${index}`} style={{flex:1, alignItems:"center"}}>
            <Text style={{color:C.sub, fontSize:10}}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
const Bar = ({value,total,color})=>{
  const C = useColors();
  const pct = Math.min(100, Math.round((value/Math.max(1,total))*100));
  return <View style={{height:12, backgroundColor:C.dim, borderRadius:999, overflow:"hidden"}}>
    <View style={{width:`${pct}%`, height:"100%", backgroundColor:color||C.acc}}/>
  </View>;
};
const Stat = ({label,value})=>{
  const C = useColors();
  return (
    <View style={{alignItems:"center"}}>
      <Text style={{color:C.txt, fontWeight:"800"}}>{value}</Text>
      <Text style={{color:C.sub, fontSize:12}}>{label}</Text>
    </View>
  );
};

/* ---------------------- Storage ---------------------- */
const K = { HABITS:"HABITS", SESS:"SESSIONS", PREFS:"PREFS", GOALS:"GOALS", WATER:"WATER" };
const DEFAULT_PREFS = { notificationsEnabled:false, notifyHour:20, themeName:"midnight" };
async function load(key, fb){ try{ const r=await AsyncStorage.getItem(key); return r?JSON.parse(r):fb; } catch{ return fb; } }
async function save(key, val){ try{ await AsyncStorage.setItem(key, JSON.stringify(val)); } catch{} }

/* ---------------------- domínio ---------------------- */
// habit:   {id, name, target, color, icon, order}
// session: {id, habitId, dateISO, minutes, note?}  (minutos podem ser negativos p/ ajuste)
async function ensureSeed(){
  const has = await load(K.HABITS,null);
  if (has) return;
  const sample = [
    { id: uid(), name:"Faculdade",   target:420, color:"#5B8CFF", icon:"🎓", order:0 },
    { id: uid(), name:"Leitura",     target:420, color:"#18C08F", icon:"📚", order:1 },
    { id: uid(), name:"Empresa",     target:420, color:"#FFB020", icon:"🏢", order:2 },
    { id: uid(), name:"Programação", target:420, color:"#FF6B6B", icon:"💻", order:3 },
  ];
  await save(K.HABITS, sample);
  await save(K.SESS, []);
  await save(K.GOALS, []);
  await save(K.PREFS, DEFAULT_PREFS);
  await save(K.WATER, {});
}

function aggregateWeek(sessions, habits, startDate){
  const start = weekStart(startDate);
  const end = addDays(start, 7);

  const byHabit = {}; habits.forEach(h=>byHabit[h.id]=0);
  const dailyByHabit = Array.from({length:7}, ()=> ({}));
  const dailyTotal = Array.from({length:7}, ()=> 0);

  sessions.forEach(s=>{
    const d = new Date(s.dateISO);
    if (d < start || d >= end) return;
    const normalizedDay = normalizeDate(d);
    const idx = Math.round((normalizedDay - start)/86400000);
    if (idx < 0 || idx > 6) return;
    const mins = Number(s.minutes) || 0;
    byHabit[s.habitId] = (byHabit[s.habitId]||0) + mins;
    dailyByHabit[idx][s.habitId] = (dailyByHabit[idx][s.habitId]||0) + mins;
    dailyTotal[idx] += mins;
  });

  // clamp visual
  Object.keys(byHabit).forEach(k=>{ if (byHabit[k] < 0) byHabit[k] = 0; });
  dailyByHabit.forEach(d=>{
    Object.keys(d).forEach(k=>{ if (d[k] < 0) d[k] = 0; });
  });
  for (let i=0;i<7;i++) dailyTotal[i] = Math.max(0, dailyTotal[i]);

  return { byHabit, dailyByHabit, dailyTotal, start, end };
}

/* histórico de N semanas (0 = semana atual, 1 = semana passada, ...) */
function buildHistory(sessions, habits, weeks=8){
  const out = [];
  let cursor = weekStart(); // início da semana atual
  for (let i=0; i<weeks; i++){
    const agg = aggregateWeek(sessions, habits, cursor);
    const total = Object.values(agg.byHabit).reduce((a,b)=>a+b,0);
    const byHabitArr = habits.map(h=>({id:h.id, name:h.name, color:h.color, mins:Math.max(0, agg.byHabit[h.id]||0)}));
    out.push({ start: new Date(cursor), total: Math.max(0,total), byHabit: byHabitArr });
    cursor = addDays(cursor, -7);
  }
  return out.reverse(); // do mais antigo ao mais recente
}

/* ---------------------- App ---------------------- */
export default function App(){
  const [tab, setTab] = useState("dashboard"); // dashboard | log | habits | reports
  const [habits, setHabits] = useState([]);
  const [sessions, setSess] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [goals, setGoals] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [waterLog, setWaterLog] = useState({});

  useEffect(()=>{ (async()=>{
    await ensureSeed();
    setHabits(await load(K.HABITS, []));
    setSess(await load(K.SESS, []));
    setGoals(await load(K.GOALS, []));
    setWaterLog(await load(K.WATER, {}));
    const storedPrefs = await load(K.PREFS, DEFAULT_PREFS);
    setPrefs({...DEFAULT_PREFS, ...storedPrefs});
  })(); },[]);

  const themeName = prefs.themeName || DEFAULT_PREFS.themeName;
  const colors = useMemo(()=>THEMES[themeName] || THEMES.midnight, [themeName]);
  const C = colors;

  const currentWeekAgg = useMemo(()=>aggregateWeek(sessions, habits, new Date()), [sessions, habits]);
  const selectedWeekAgg = useMemo(()=>{
    const base = normalizeDate(selectedDate);
    return aggregateWeek(sessions, habits, base);
  }, [sessions, habits, selectedDate]);
  const history8 = useMemo(()=>buildHistory(sessions, habits, 8), [sessions, habits]);
  const notificationBody = useMemo(()=>buildGoalNotificationBody(goals, currentWeekAgg), [goals, currentWeekAgg]);

  const updatePrefs = useCallback(async (next)=>{
    const base = typeof next === "function" ? next(prefs) : next;
    const finalPrefs = { ...DEFAULT_PREFS, ...prefs, ...base };
    setPrefs(finalPrefs);
    await save(K.PREFS, finalPrefs);
    return finalPrefs;
  }, [prefs]);

  const changeTheme = useCallback((name)=>{
    const key = THEMES[name] ? name : DEFAULT_PREFS.themeName;
    updatePrefs(prev=>({...prev, themeName:key}));
  }, [updatePrefs]);

  const themeContextValue = useMemo(()=>({ colors, themeName, setThemeName: changeTheme }), [colors, themeName, changeTheme]);

  const updateWaterForDate = useCallback((dateKey, updater)=>{
    if (!dateKey) return;
    setWaterLog(prev=>{
      const current = prev[dateKey] || { bottles:0, progress:0 };
      const nextValue = typeof updater === "function" ? updater(current) : updater || current;
      const sanitized = {
        bottles: Math.max(0, Math.round(nextValue?.bottles ?? current.bottles ?? 0)),
        progress: clamp(typeof nextValue?.progress === "number" ? nextValue.progress : current.progress || 0, 0, 1),
      };
      const updated = { ...prev, [dateKey]: sanitized };
      save(K.WATER, updated);
      return updated;
    });
  }, []);

  /* ------ actions ------ */
  const addMinutes = useCallback(async (habitId, mins, note="")=>{
    if (!habitId || !mins || isNaN(mins)) return false;
    const m = parseInt(mins,10);
    if (!m) return false;
    const entry = { id: uid(), habitId, dateISO: new Date().toISOString(), minutes: m, note };

    let snapshot = null;
    setSess(prev=>{
      snapshot = [...prev, entry];
      return snapshot;
    });

    await save(K.SESS, snapshot || [entry]);
    return true;
  }, [setSess]);

  const createHabit = async ({name, target, icon, color})=>{
    if (!name?.trim()) return;
    const list = await load(K.HABITS, []);
    list.push({ id: uid(), name: name.trim(), target: clamp(parseInt(target||"0",10),0,100000), icon: icon||"✅", color: color||"#5B8CFF", order: list.length });
    await save(K.HABITS, list); setHabits(list);
  };

  const updateHabit = async (id, patch)=>{
    const list = (await load(K.HABITS, [])).map(h=>h.id===id?{...h, ...patch}:h);
    await save(K.HABITS, list); setHabits(list);
  };

  const removeHabit = async (id)=>{
    Alert.alert("Excluir atividade?", "Isso não apaga sessões antigas, apenas remove a atividade da lista.", [
      { text:"Cancelar", style:"cancel" },
      { text:"Excluir", style:"destructive", onPress: async ()=>{
        await save(K.HABITS, (await load(K.HABITS,[])).filter(h=>h.id!==id));
        setHabits(await load(K.HABITS,[]));
      }}
    ]);
  };

  const createGoal = async ({ title, target, habitId })=>{
    if (!title?.trim()) { Alert.alert("Meta inválida","Informe um nome para a meta."); return; }
    const parsedTarget = clamp(parseInt(target||"0",10), 1, 1000000);
    if (!parsedTarget) { Alert.alert("Meta inválida","Defina um valor em minutos maior que zero."); return; }
    const list = await load(K.GOALS, []);
    list.push({ id: uid(), title: title.trim(), target: parsedTarget, habitId: habitId||"total" });
    await save(K.GOALS, list);
    setGoals(list);
  };

  const deleteGoal = async (id)=>{
    const list = (await load(K.GOALS, [])).filter(g=>g.id!==id);
    await save(K.GOALS, list);
    setGoals(list);
  };

  const { notificationsEnabled, notifyHour } = prefs;

  useEffect(()=>{
    if (!notificationsEnabled) {
      (async()=>{ try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {} })();
      return;
    }
    let cancelled = false;
    (async()=>{
      const granted = await ensureNotificationPermission();
      if (!granted){
        if (!cancelled) {
          Alert.alert("Notificações desativadas","Não foi possível habilitar as notificações. Verifique as permissões do dispositivo.");
          await updatePrefs(prev=>({...prev, notificationsEnabled:false}));
        }
        return;
      }
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Revisar metas semanais",
            body: notificationBody,
          },
          trigger: {
            hour: clamp(notifyHour||20, 0, 23),
            minute: 0,
            repeats: true,
          },
        });
      } catch (err) {
        // ambiente sem suporte a notificações
      }
    })();
    return ()=>{ cancelled = true; };
  }, [notificationsEnabled, notifyHour, notificationBody, updatePrefs]);

  /* ------ UI ------ */
  const today = new Date();
  const weekStartDate = weekStart(today);
  const selectedKey = selectedDate ? selectedDate.toDateString() : today.toDateString();
  const dayItems = Array.from({length:7}).map((_, idx)=>{
    const date = addDays(weekStartDate, idx);
    const label = shortDow[idx];
    const isToday = date.toDateString() === today.toDateString();
    return { date, label, isToday };
  });

  const navItems = useMemo(()=>[
    { id:"log", label:"Days", icon:"📅" },
    { id:"habits", label:"Programs", icon:"🎯" },
    { id:"dashboard", label:"Journal", icon:"📔" },
    { id:"reports", label:"Statistics", icon:"📊" },
    { id:"settings", label:"Settings", icon:"⚙️" },
  ], []);

  const currentDayName = dayNames[today.getDay()];
  const currentDateLabel = `${("0"+today.getDate()).slice(-2)} ${monthNamesShort[today.getMonth()]}`;

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <SafeAreaView style={{flex:1, backgroundColor: C.bg}}>
        <View style={{flex:1}}>
        <View style={{paddingHorizontal:P, paddingTop:P}}>
          <View style={{marginBottom:16}}>
            <Text style={{color:C.sub, fontSize:12, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>Today</Text>
            <Text style={{color:C.txt, fontSize:30, fontWeight:"900"}}>{currentDayName}</Text>
            <Text style={{color:C.sub, fontSize:18, fontWeight:"700"}}>{currentDateLabel}</Text>
          </View>

          {tab==="dashboard" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:16, paddingBottom:4}}>
              <View style={{flexDirection:"row"}}>
                {dayItems.map((item, index)=>{
                  const isActive = item.date.toDateString() === selectedKey;
                  return (
                    <Pressable
                      key={index}
                      onPress={()=>setSelectedDate(new Date(item.date))}
                      style={({pressed})=>({
                        marginRight:14,
                        width:54,
                        height:70,
                        alignItems:"center",
                        justifyContent:"center",
                      })}
                    >
                      <View
                        style={{
                          width:50,
                          height:50,
                          borderRadius:25,
                          borderWidth:isActive?2:1,
                          borderColor:isActive?C.acc:C.brd,
                          backgroundColor:isActive?hexToRgba(C.acc,0.15):C.card,
                          justifyContent:"center",
                          alignItems:"center",
                          shadowColor:isActive?C.acc:"transparent",
                          shadowOpacity:isActive?0.35:0,
                          shadowRadius:12,
                        }}
                      >
                        <Text style={{color:isActive?C.txt:C.sub, fontWeight:"900", fontSize:14}}>{item.label}</Text>
                        <Text style={{color:isActive?C.acc:C.sub, fontWeight:"700", fontSize:11}}>{("0"+item.date.getDate()).slice(-2)}</Text>
                      </View>
                      {item.isToday ? (
                        <View style={{marginTop:6, width:6, height:6, borderRadius:3, backgroundColor:isActive?C.acc:C.sub}} />
                      ) : <View style={{height:6}} />}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        <View style={{flex:1, paddingHorizontal:P, paddingBottom:P*2}}>
          {tab==="dashboard" && (
            <JournalScreen
              habits={habits}
              agg={currentWeekAgg}
              history8={history8}
              selectedDate={selectedDate}
              sessions={sessions}
              waterLog={waterLog}
            />
          )}

          {tab==="log" && (
            <DaysScreen
              habits={habits}
              sessions={sessions}
              onAdd={addMinutes}
              waterLog={waterLog}
              onWaterChange={updateWaterForDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              agg={selectedWeekAgg}
              history={history8}
            />
          )}

          {tab==="habits" && (
            <ProgramsScreen
              habits={habits}
              onCreate={createHabit}
              onUpdate={updateHabit}
              onDelete={removeHabit}
              goals={goals}
              onGoalCreate={createGoal}
              onGoalDelete={deleteGoal}
              agg={currentWeekAgg}
            />
          )}

          {tab==="reports" && (
            <StatisticsScreen
              habits={habits}
              sessions={sessions}
              cursor={cursor}
              setCursor={setCursor}
              onAdd={addMinutes}
            />
          )}

          {tab==="settings" && (
            <SettingsScreen
              prefs={prefs}
              onPrefsChange={updatePrefs}
              onThemeChange={changeTheme}
              themeName={themeName}
            />
          )}
        </View>
      </View>

        <BottomTabs current={tab} onSelect={setTab} items={navItems} />
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

/* ---------------------- sub-screens ---------------------- */

function JournalScreen({ habits, agg, history8, selectedDate, sessions, waterLog={} }){
  const C = useColors();
  const totalTarget = useMemo(()=>habits.reduce((a,h)=>a+(h.target||0),0), [habits]);
  const totalThisWeek = useMemo(()=>Object.values(agg.byHabit||{}).reduce((a,b)=>a+b,0), [agg]);
  const sortedByWeek = useMemo(()=>{
    return [...habits].map(h=>({
      ...h,
      done: Math.max(0, agg.byHabit[h.id]||0),
    })).sort((a,b)=>b.done-a.done);
  }, [habits, agg]);
  const topThree = sortedByWeek.slice(0,3);
  const highlight = topThree[0];
  const thisWeek = history8[history8.length-1] || { total: totalThisWeek, start: agg.start };
  const previousWeek = history8.length>1 ? history8[history8.length-2] : null;
  const desempenhoPct = previousWeek && previousWeek.total>0
    ? Math.round((thisWeek.total/Math.max(1, previousWeek.total))*100)
    : 100;
  const delta = thisWeek.total - (previousWeek?.total || 0);
  const deltaLabel = delta===0 ? "Sem variação" : `${delta>=0?"+":"-"}${fmtHM(Math.abs(delta)).replace(" (-)","")}`;
  const deltaColor = delta>=0 ? C.good : C.bad;
  const completionPct = totalTarget>0 ? Math.min(100, Math.round(100*totalThisWeek/totalTarget)) : 0;

  const dayStart = useMemo(()=>{ const d=new Date(selectedDate||new Date()); d.setHours(0,0,0,0); return d; }, [selectedDate]);
  const dayEnd = useMemo(()=>addDays(dayStart, 1), [dayStart]);
  const sessionsForDay = useMemo(()=> sessions.filter(s=>{ const d=new Date(s.dateISO); return d>=dayStart && d<dayEnd; }), [sessions, dayStart, dayEnd]);
  const dayByHabit = useMemo(()=>{
    const map={};
    sessionsForDay.forEach(s=>{
      const amount = Number(s.minutes) || 0;
      if (!amount) return;
      map[s.habitId] = (map[s.habitId]||0) + amount;
    });
    return Object.entries(map).map(([id,value])=>{
      const ref = habits.find(h=>h.id===id);
      return { id, value, icon:ref?.icon||"", name:ref?.name||"Atividade", color:ref?.color||C.acc };
    }).filter(item=>item.value!==0).sort((a,b)=>b.value-a.value);
  }, [sessionsForDay, habits, C.acc]);
  const dayTotal = dayByHabit.reduce((a,b)=>a+b.value,0);
  const dayPositiveTotal = dayByHabit.reduce((a,b)=>a+Math.max(0,b.value),0);
  const previousWeekAgg = useMemo(()=>{
    const base = agg?.start instanceof Date ? agg.start : weekStart();
    return aggregateWeek(sessions, habits, addDays(base, -7));
  }, [sessions, habits, agg?.start]);
  const currentDailyTotals = useMemo(()=> shortDowPt.map((_, idx)=> Math.max(0, agg?.dailyTotal?.[idx] || 0)), [agg]);
  const previousDailyTotals = useMemo(()=> shortDowPt.map((_, idx)=> Math.max(0, previousWeekAgg?.dailyTotal?.[idx] || 0)), [previousWeekAgg]);
  const weekSessions = useMemo(()=>{
    const start = agg.start;
    const end = addDays(start, 7);
    return sessions.filter(s=>{ const d=new Date(s.dateISO); return d>=start && d<end; });
  }, [sessions, agg.start]);
  const dayKey = dayStart.toISOString().slice(0,10);
  const waterState = waterLog?.[dayKey] || { bottles:0, progress:0 };
  const waterProgressPct = Math.round(clamp(waterState.progress||0, 0, 1)*100);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:32}}>
      <Card style={{marginBottom:16, padding:20}}>
        <View style={{flexDirection:"row", alignItems:"center"}}>
          <View style={{width:110, height:110, borderRadius:55, borderWidth:4, borderColor:hexToRgba(C.acc,0.45), alignItems:"center", justifyContent:"center", backgroundColor:hexToRgba(C.acc,0.12), marginRight:20}}>
            <Text style={{color:C.txt, fontSize:30, fontWeight:"900"}}>{desempenhoPct}%</Text>
            <Text style={{color:C.sub, fontWeight:"700", fontSize:12, letterSpacing:1, textAlign:"center"}}>Desempenho</Text>
            <Text style={{color:deltaColor, fontSize:12, fontWeight:"700", marginTop:6}}>{deltaLabel}</Text>
          </View>
          <View style={{flex:1}}>
            <Text style={{color:C.sub, fontSize:12, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>Semana atual</Text>
            <Text style={{color:C.txt, fontSize:22, fontWeight:"900", marginTop:4}}>
              {highlight ? `${highlight.icon} ${highlight.name}` : "Sem atividades registradas"}
            </Text>
            <Text style={{color:C.sub, marginTop:8}}>Período • {fmtDate(agg.start)} - {fmtDate(addDays(agg.start,6))}</Text>
            <View style={{marginTop:16}}>
              <View style={{flexDirection:"row", justifyContent:"space-between"}}>
                <SummaryPill label="Total" value={fmtHM(totalThisWeek)} />
                <SummaryPill label="Meta" value={`${completionPct}%`} compact />
                <SummaryPill label="Registros" value={String(weekSessions.length)} compact />
              </View>
            </View>
          </View>
        </View>

        <View style={{marginTop:20}}>
          <Text style={{color:C.sub, fontWeight:"700", marginBottom:10}}>Atividades mais fortes</Text>
          {topThree.length === 0 ? (
            <Text style={{color:C.sub}}>Nenhuma atividade registrada ainda nesta semana.</Text>
          ) : (
            topThree.map((item, idx)=>(
              <View key={item.id} style={{marginBottom:12}}>
                <View style={{flexDirection:"row", justifyContent:"space-between", marginBottom:6}}>
                  <Text style={{color:C.txt, fontWeight:"800"}}>{idx+1}. {item.icon} {item.name}</Text>
                  <Text style={{color:C.sub}}>{fmtHM(item.done)}</Text>
                </View>
                <Bar value={item.done} total={item.target||item.done||1} color={item.color}/>
              </View>
            ))
          )}
        </View>
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <Text style={{color:C.sub, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>Semana atual vs. semana passada</Text>
          <Text style={{color:C.sub}}>{shortDowPt.length} dias</Text>
        </View>
        <View style={{flexDirection:"row", alignItems:"center", marginBottom:12}}>
          <View style={{flexDirection:"row", alignItems:"center", marginRight:16}}>
            <View style={{width:12, height:12, borderRadius:6, backgroundColor:C.acc, marginRight:6}} />
            <Text style={{color:C.sub, fontSize:12, fontWeight:"700"}}>Semana atual</Text>
          </View>
          <View style={{flexDirection:"row", alignItems:"center"}}>
            <View style={{width:12, height:12, borderRadius:6, borderWidth:2, borderColor:hexToRgba(C.sub,0.7), backgroundColor:hexToRgba(C.sub,0.18), marginRight:6}} />
            <Text style={{color:C.sub, fontSize:12, fontWeight:"700"}}>Semana passada</Text>
          </View>
        </View>
        <View style={{backgroundColor:C.dim, borderRadius:18, padding:12}}>
          <WeeklyCompareChart
            labels={shortDowPt}
            current={currentDailyTotals}
            previous={previousDailyTotals}
            color={C.acc}
            previousColor={C.sub}
            height={190}
          />
        </View>
        <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:14}}>
          <SummaryPill label="Semana atual" value={fmtHM(thisWeek.total||0)} />
          <SummaryPill label="Anterior" value={fmtHM(previousWeek?.total||0)} />
          <SummaryPill label="Diferença" value={deltaLabel === "Sem variação" ? fmtHM(0) : deltaLabel} />
        </View>
      </Card>

      <Card style={{padding:20}}>
        <Text style={{color:C.sub, fontWeight:"700", marginBottom:10}}>Foco do dia • {monthDay(dayStart)}</Text>
        {dayByHabit.length === 0 ? (
          <Text style={{color:C.sub}}>Nenhuma atividade registrada para o dia selecionado.</Text>
        ) : (
          <View style={{marginBottom:16}}>
            <Text style={{color:C.sub, fontWeight:"700", marginBottom:8}}>Horas por atividade</Text>
            {dayByHabit.map(item=>(
              <View key={item.id} style={{marginBottom:10}}>
                <View style={{flexDirection:"row", justifyContent:"space-between"}}>
                  <Text style={{color:C.txt, fontWeight:"800"}}>{item.icon} {item.name}</Text>
                  <Text style={{color:C.sub}}>{fmtHM(item.value)}</Text>
                </View>
                <Bar value={Math.max(0, item.value)} total={Math.max(dayPositiveTotal, 1)} color={item.color} />
              </View>
            ))}
          </View>
        )}

        <View style={{flexDirection:"row", flexWrap:"wrap", marginBottom:16}}>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label="Registros" value={String(sessionsForDay.length)} compact />
          </View>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label="Minutos no dia" value={fmtHM(dayTotal)} compact />
          </View>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label="Total na semana" value={fmtHM(totalThisWeek)} compact />
          </View>
        </View>

        <View style={{backgroundColor:C.dimStrong||C.dim, borderRadius:14, padding:14, borderWidth:1, borderColor:C.brd, marginBottom:20}}>
          <Text style={{color:C.sub, fontWeight:"700"}}>Consumo de água</Text>
          <Text style={{color:C.txt, fontWeight:"900", fontSize:18, marginTop:6}}>{waterState.bottles || 0} garrafas</Text>
          <Text style={{color:C.sub, marginTop:6}}>Garrafa atual: {waterProgressPct}%</Text>
        </View>

        <Text style={{color:C.sub, fontWeight:"700", marginBottom:8}}>Registros do dia</Text>
        {sessionsForDay.length === 0 ? (
          <Text style={{color:C.sub}}>Comece adicionando suas atividades em Days.</Text>
        ) : (
          sessionsForDay.map(s=>{
            const ref = habits.find(h=>h.id===s.habitId);
            return (
              <View key={s.id} style={{paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.brd}}>
                <Text style={{color:C.txt, fontWeight:"800"}}>{ref?.icon} {ref?.name || "Atividade"}</Text>
                <Text style={{color:C.sub, marginTop:2}}>{fmtHM(s.minutes)} • {new Date(s.dateISO).toLocaleTimeString().slice(0,5)}</Text>
                {s.note ? <Text style={{color:C.sub, marginTop:4}}>{s.note}</Text> : null}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const SummaryPill = ({ label, value, compact }) => {
  const C = useColors();
  return (
    <View style={{backgroundColor:C.dimStrong||C.dim, borderRadius:14, paddingVertical:10, paddingHorizontal:12, borderWidth:1, borderColor:C.brd, minWidth: compact ? 78 : 86}}>
      <Text style={{color:C.sub, fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>{label}</Text>
      <Text style={{color:C.txt, fontWeight:"900", fontSize:compact?16:18, marginTop:4}}>{value}</Text>
    </View>
  );
};

function ActivityLogger({ habits, onAdd, style, title }){
  const C = useColors();
  const [selectedHabit, setSelectedHabit] = useState(habits[0]?.id || null);
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState("");
  const hasHabits = habits.length > 0;
  const [pending, setPending] = useState(false);

  useEffect(()=>{
    if (!habits.length){
      setSelectedHabit(null);
      return;
    }
    if (!selectedHabit || !habits.find(h=>h.id===selectedHabit)){
      setSelectedHabit(habits[0]?.id || null);
    }
  }, [habits, selectedHabit]);

  const adjustDuration = (delta)=>{
    setDuration(prev=> clamp((prev||0) + delta, 5, 480));
  };
  const setDurationDirect = (value)=>{
    setDuration(clamp(value, 5, 480));
  };
  const commit = async (sign)=>{
    if (pending) return;
    if (!selectedHabit){ Alert.alert('Selecione uma atividade'); return; }
    const value = parseInt(duration,10);
    if (!value || value<=0){ Alert.alert('Duração inválida','Use o controle para definir os minutos.'); return; }
    if (typeof onAdd !== 'function') return;

    setPending(true);
    try {
      const ok = await onAdd(selectedHabit, sign*value, note);
      if (!ok){
        Alert.alert('Não foi possível registrar', 'Tente novamente em instantes.');
        return;
      }

      setNote("");
      setDuration(30);
    } finally {
      setPending(false);
    }
  };

  const showTitle = typeof title === 'string' && title.trim().length > 0;

  return (
    <View style={style}>
      {showTitle ? (
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>{title}</Text>
      ) : null}
      {hasHabits ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:'row'}}>
            {habits.map(h=>(
              <View key={h.id} style={{marginRight:8}}>
                <Tag label={`${h.icon} ${h.name}`} active={selectedHabit===h.id} onPress={()=>setSelectedHabit(h.id)} />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={{color:C.sub}}>Cadastre uma atividade para registrar sessões.</Text>
      )}

      <View style={{marginTop:16}}>
        <Text style={{color:C.sub, marginBottom:8}}>Minutos</Text>
        <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:C.dimStrong||C.dim, borderRadius:14, padding:12, borderWidth:1, borderColor:C.brd}}>
          <Pressable onPress={()=>adjustDuration(-5)} style={{padding:6}}><Text style={{color:C.acc, fontSize:24, fontWeight:'900'}}>-</Text></Pressable>
          <Text style={{color:C.txt, fontSize:28, fontWeight:'900'}}>{duration}m</Text>
          <Pressable onPress={()=>adjustDuration(5)} style={{padding:6}}><Text style={{color:C.acc, fontSize:24, fontWeight:'900'}}>+</Text></Pressable>
        </View>
        <View style={{flexDirection:'row', marginTop:12, flexWrap:'wrap'}}>
          {[10,20,30,45,60].map(val=>(
            <View key={val} style={{marginRight:8, marginBottom:8}}>
              <Chip title={`${val}m`} onPress={()=>setDurationDirect(val)} />
            </View>
          ))}
        </View>
      </View>

      <Text style={{color:C.sub, marginTop:16, marginBottom:6}}>Anotações</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder='Como foi a sessão?'
        placeholderTextColor='#7d8fb0'
        multiline
        style={{minHeight:68, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd}}
      />

      <View style={{flexDirection:'row', marginTop:16}}>
        <Btn title='Adicionar' onPress={()=>commit(1)} style={{flex:1}} disabled={!hasHabits || pending} />
        <View style={{width:12}} />
        <Btn title='Remover' kind='danger' onPress={()=>commit(-1)} style={{flex:1}} disabled={!hasHabits || pending} />
      </View>
    </View>
  );
}

function DaysScreen({ habits, sessions, onAdd, waterLog, onWaterChange, selectedDate, onSelectDate, agg, history=[] }){
  const C = useColors();

  const date = useMemo(()=>normalizeDate(selectedDate), [selectedDate]);
  const weekStartDate = useMemo(()=> agg?.start ? normalizeDate(agg.start) : weekStart(date), [agg?.start, date]);
  const weekEndDate = useMemo(()=>addDays(weekStartDate, 6), [weekStartDate]);
  const dayOffset = useMemo(()=> clamp(Math.round((date - weekStartDate)/86400000), 0, 6), [date, weekStartDate]);
  const weekLabel = useMemo(()=>`Semana ${fmtDate(weekStartDate)} - ${fmtDate(weekEndDate)}`, [weekStartDate, weekEndDate]);
  const weekChoices = useMemo(()=>{
    if (!Array.isArray(history) || history.length===0) return [];
    return [...history].reverse().map(week=>{
      const start = normalizeDate(week.start);
      const end = addDays(start, 6);
      return {
        key: start.toISOString(),
        start,
        end,
        label: `${fmtDate(start)} - ${fmtDate(end)}`,
      };
    });
  }, [history]);
  const historySeries = useMemo(()=> (Array.isArray(history) ? history : []).map(week=>({
    label: monthDay(week.start),
    value: Math.max(0, week.total||0),
  })), [history]);
  const historyIndex = useMemo(()=>{
    if (!Array.isArray(history)) return -1;
    return history.findIndex(week=>isSameWeek(week.start, weekStartDate));
  }, [history, weekStartDate]);
  const currentHistoryWeek = historyIndex>=0 ? history[historyIndex] : null;
  const previousHistoryWeek = historyIndex>0 ? history[historyIndex-1] : null;

  const changeWeek = useCallback((offset)=>{
    if (!onSelectDate) return;
    const targetStart = addDays(weekStartDate, offset*7);
    const next = addDays(targetStart, dayOffset);
    onSelectDate(next);
  }, [onSelectDate, weekStartDate, dayOffset]);

  const handleSelectWeek = useCallback((start)=>{
    if (!onSelectDate || !start) return;
    const targetStart = normalizeDate(start);
    const next = addDays(targetStart, dayOffset);
    onSelectDate(next);
  }, [onSelectDate, dayOffset]);

  const ranking = useMemo(()=>{
    return [...habits].map(h=>({
      ...h,
      done: Math.max(0, agg.byHabit?.[h.id]||0),
    })).sort((a,b)=>b.done-a.done).slice(0,3);
  }, [habits, agg]);

  const weekTotal = useMemo(()=>Object.values(agg.byHabit||{}).reduce((a,b)=>a+b,0), [agg]);
  const dateKey = date.toISOString().slice(0,10);
  const waterState = waterLog?.[dateKey] || { bottles:0, progress:0 };

  const handleWaterChange = useCallback((payload)=>{
    if (!onWaterChange || !dateKey) return;
    if (typeof payload === 'function') onWaterChange(dateKey, payload);
    else onWaterChange(dateKey, payload);
  }, [onWaterChange, dateKey]);

  const dayStart = useMemo(()=>normalizeDate(date), [date]);
  const dayEnd = useMemo(()=>addDays(dayStart, 1), [dayStart]);
  const sessionsForDay = useMemo(()=> sessions
    .filter(s=>{ const d=new Date(s.dateISO); return d>=dayStart && d<dayEnd; })
    .sort((a,b)=> new Date(b.dateISO) - new Date(a.dateISO))
  , [sessions, dayStart, dayEnd]);

  const dayByHabit = useMemo(()=>{
    const map={};
    sessionsForDay.forEach(s=>{
      const amount = Number(s.minutes) || 0;
      if (!amount) return;
      map[s.habitId] = (map[s.habitId]||0) + amount;
    });
    return Object.entries(map).map(([id,value])=>{
      const ref = habits.find(h=>h.id===id);
      return { id, value, icon:ref?.icon||"", name:ref?.name||"Atividade", color:ref?.color||C.acc };
    }).filter(item=>item.value!==0).sort((a,b)=>b.value-a.value);
  }, [sessionsForDay, habits, C.acc]);

  const dayTotal = useMemo(()=> dayByHabit.reduce((acc, item)=>acc+item.value, 0), [dayByHabit]);
  const dayPositiveTotal = useMemo(()=> dayByHabit.reduce((acc, item)=>acc+Math.max(0,item.value), 0), [dayByHabit]);
  const dayPeriodData = useMemo(()=>{
    const palette = [C.acc, C.good, C.warn, C.bad || C.acc];
    const periods = [
      { key:"dawn", label:"Madrugada", start:0, end:6 },
      { key:"morning", label:"Manhã", start:6, end:12 },
      { key:"afternoon", label:"Tarde", start:12, end:18 },
      { key:"night", label:"Noite", start:18, end:24 },
    ];
    const buckets = periods.map((period, index)=>({ ...period, value:0, color: palette[index] || C.acc }));
    sessionsForDay.forEach(session=>{
      const minutes = Math.max(0, Number(session.minutes) || 0);
      if (!minutes) return;
      const refDate = new Date(session.dateISO);
      if (Number.isNaN(refDate.getTime())) return;
      const hourValue = refDate.getHours() + (refDate.getMinutes()||0)/60;
      const targetIndex = buckets.findIndex(period=> hourValue >= period.start && hourValue < period.end);
      const index = targetIndex >= 0 ? targetIndex : buckets.length - 1;
      buckets[index].value += minutes;
    });
    return buckets.map(({key,label,color,value})=>({ key, label, color, value }));
  }, [sessionsForDay, C.acc, C.good, C.warn, C.bad]);
  const dayPeriodTotal = useMemo(()=> dayPeriodData.reduce((acc, item)=>acc+item.value, 0), [dayPeriodData]);
  const hasDayPeriodData = useMemo(()=> dayPeriodData.some(item=>item.value>0), [dayPeriodData]);
  const lastEntries = useMemo(()=>[...sessions]
    .sort((a,b)=> new Date(b.dateISO) - new Date(a.dateISO))
    .slice(0,8), [sessions]);
  const selectedWeekTotal = useMemo(()=>{
    if (currentHistoryWeek){
      return Math.max(0, currentHistoryWeek.total||0);
    }
    return Math.max(0, weekTotal||0);
  }, [currentHistoryWeek, weekTotal]);
  const previousWeekTotal = Math.max(0, previousHistoryWeek?.total || 0);
  const delta = selectedWeekTotal - previousWeekTotal;
  const deltaLabel = delta===0 ? "Sem variação" : `${delta>=0?"+":"-"}${fmtHM(Math.abs(delta)).replace(" (-)","")}`;
  const deltaForPill = delta===0 ? fmtHM(0) : deltaLabel;
  const deltaColor = delta===0 ? C.sub : (delta>0 ? C.good : C.bad);
  const changeDay = (offset)=>{
    if (!onSelectDate) return;
    onSelectDate(addDays(dayStart, offset));
  };

  const dayLabel = `${dayNames[date.getDay()]} • ${monthDay(date)}`;

  return (
    <ScrollView contentContainerStyle={{paddingBottom:32}}>
      <Card style={{marginBottom:16, padding:20}}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <View>
            <Text style={{color:C.sub, fontWeight:'700'}}>Dia selecionado</Text>
            <Text style={{color:C.txt, fontSize:22, fontWeight:'900'}}>{dayLabel}</Text>
            <Text style={{color:C.sub, marginTop:6}}>{weekLabel}</Text>
          </View>
          <View style={{flexDirection:'row'}}>
            <Btn title='◀' kind='chip' onPress={()=>changeDay(-1)} style={{width:48}} />
            <View style={{width:8}} />
            <Btn title='▶' kind='chip' onPress={()=>changeDay(1)} style={{width:48}} />
          </View>
        </View>
        <View>
          <Text style={{color:C.sub, fontWeight:'700', marginBottom:10}}>Atividades mais feitas na semana</Text>
          {ranking.length === 0 ? (
            <Text style={{color:C.sub}}>Nenhuma atividade registrada ainda.</Text>
          ) : ranking.map((item, idx)=>(
            <View key={item.id} style={{marginBottom:12}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:6}}>
                <Text style={{color:C.txt, fontWeight:'800'}}>{idx+1}. {item.icon} {item.name}</Text>
                <Text style={{color:C.sub}}>{fmtHM(item.done)}</Text>
              </View>
              <Bar value={item.done} total={item.target||item.done||1} color={item.color} />
            </View>
          ))}
          <View style={{flexDirection:'row', flexWrap:'wrap', marginTop:8}}>
            <View style={{marginRight:12, marginBottom:12}}>
              <SummaryPill label='Registros' value={String(sessionsForDay.length)} compact />
            </View>
            <View style={{marginRight:12, marginBottom:12}}>
              <SummaryPill label='Minutos no dia' value={fmtHM(dayTotal)} compact />
            </View>
            <View style={{marginRight:12, marginBottom:12}}>
              <SummaryPill label='Total na semana' value={fmtHM(weekTotal)} compact />
            </View>
          </View>
        </View>
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
          <Text style={{color:C.sub, fontWeight:'700'}}>Distribuição do dia</Text>
          <View style={{flex:1}} />
          <View style={{backgroundColor:hexToRgba(C.good,0.16), paddingHorizontal:12, paddingVertical:6, borderRadius:12}}>
            <Text style={{color:C.good, fontWeight:'800'}}>{fmtHM(dayPeriodTotal)}</Text>
          </View>
        </View>
        <Text style={{color:C.sub, marginTop:6}}>{dayLabel}</Text>
        {hasDayPeriodData ? (
          <View style={{marginTop:16}}>
            <DayPeriodChart data={dayPeriodData} height={160} />
          </View>
        ) : (
          <View style={{paddingVertical:24}}>
            <Text style={{color:C.sub}}>Registre atividades para ver a distribuição por período do dia.</Text>
          </View>
        )}
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
          <Text style={{color:C.sub, fontWeight:'700', textTransform:'uppercase', letterSpacing:1}}>Tendência semanal</Text>
          <Text style={{color:C.sub}}>{historySeries.length} semanas</Text>
        </View>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:16}}>
          <View style={{flex:1, paddingRight:12}}>
            <Text style={{color:C.sub, fontWeight:'700'}}>Semana selecionada</Text>
            <Text style={{color:C.txt, fontSize:18, fontWeight:'900', marginTop:4}}>{fmtDate(weekStartDate)} - {fmtDate(weekEndDate)}</Text>
            <Text style={{color:deltaColor, fontWeight:'700', marginTop:6}}>{deltaLabel}</Text>
          </View>
          <View style={{flexDirection:'row'}}>
            <Btn title='◀' kind='chip' onPress={()=>changeWeek(-1)} style={{width:48}} />
            <View style={{width:8}} />
            <Btn title='▶' kind='chip' onPress={()=>changeWeek(1)} style={{width:48}} />
          </View>
        </View>
        {weekChoices.length>0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingVertical:8}} style={{marginTop:8}}>
            <View style={{flexDirection:'row'}}>
              {weekChoices.map(week=>(
                <OptionPill
                  key={week.key}
                  label={week.label}
                  active={isSameWeek(week.start, weekStartDate)}
                  onPress={()=>handleSelectWeek(week.start)}
                  style={{marginRight:10}}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
        {historySeries.length === 0 ? (
          <View style={{paddingVertical:20}}>
            <Text style={{color:C.sub}}>Registre atividades para visualizar o histórico.</Text>
          </View>
        ) : (
          <View style={{backgroundColor:C.dim, borderRadius:18, padding:12, marginTop:16, overflow:'hidden'}}>
            <TrendChart series={historySeries} color={C.acc} height={190} />
          </View>
        )}
        <View style={{flexDirection:'row', flexWrap:'wrap', marginTop:14}}>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label='Semana' value={fmtHM(selectedWeekTotal)} />
          </View>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label='Anterior' value={fmtHM(previousWeekTotal)} />
          </View>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label='Diferença' value={deltaForPill} />
          </View>
        </View>
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:10}}>Foco do dia • {monthDay(date)}</Text>
        {dayByHabit.length === 0 ? (
          <Text style={{color:C.sub}}>Nenhuma atividade registrada para o dia selecionado.</Text>
        ) : (
          <View style={{marginBottom:16}}>
            <Text style={{color:C.sub, fontWeight:'700', marginBottom:8}}>Horas por atividade</Text>
            {dayByHabit.map(item=>(
              <View key={item.id} style={{marginBottom:10}}>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={{color:C.txt, fontWeight:'800'}}>{item.icon} {item.name}</Text>
                  <Text style={{color:C.sub}}>{fmtHM(item.value)}</Text>
                </View>
                <Bar value={Math.max(0, item.value)} total={Math.max(dayPositiveTotal, 1)} color={item.color} />
              </View>
            ))}
          </View>
        )}
        <View style={{flexDirection:'row', flexWrap:'wrap'}}>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label='Registros' value={String(sessionsForDay.length)} compact />
          </View>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label='Minutos no dia' value={fmtHM(dayTotal)} compact />
          </View>
          <View style={{marginRight:12, marginBottom:12}}>
            <SummaryPill label='Total na semana' value={fmtHM(weekTotal)} compact />
          </View>
        </View>
        <Text style={{color:C.sub, fontWeight:'700', marginTop:8, marginBottom:6}}>Registros do dia</Text>
        {sessionsForDay.length === 0 ? (
          <Text style={{color:C.sub}}>Comece adicionando suas atividades na aba Days.</Text>
        ) : (
          sessionsForDay.map(s=>{
            const ref = habits.find(h=>h.id===s.habitId);
            return (
              <View key={s.id} style={{paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.brd}}>
                <Text style={{color:C.txt, fontWeight:'800'}}>{ref?.icon} {ref?.name || 'Atividade'}</Text>
                <Text style={{color:C.sub, marginTop:2}}>{fmtHM(s.minutes)} • {new Date(s.dateISO).toLocaleTimeString().slice(0,5)}</Text>
                {s.note ? <Text style={{color:C.sub, marginTop:4}}>{s.note}</Text> : null}
              </View>
            );
          })
        )}
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Monitor de água</Text>
        <Text style={{color:C.sub, marginBottom:12}}>Use os controles para registrar frações ou completar a garrafa do dia sem precisar arrastar.</Text>
        <WaterTracker value={waterState} onChange={handleWaterChange} />
        <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:16, alignItems:'center'}}>
          <Text style={{color:C.txt, fontWeight:'800'}}>{waterState.bottles || 0} garrafas hoje</Text>
          <View style={{flexDirection:'row'}}>
            <Btn title='-1' kind='chip' onPress={()=>handleWaterChange(prev=>({ ...prev, bottles: Math.max(0, (prev?.bottles||0)-1), progress:0 }))} style={{marginRight:8}} />
            <Btn title='+1' onPress={()=>handleWaterChange(prev=>({ bottles:(prev?.bottles||0)+1, progress:0 }))} />
          </View>
        </View>
      </Card>

      <Card style={{padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:8}}>Últimos registros gerais</Text>
        {lastEntries.length === 0 ? (
          <Text style={{color:C.sub}}>Nenhuma atividade registrada ainda.</Text>
        ) : (
          lastEntries.map(item=>{
            const ref = habits.find(h=>h.id===item.habitId);
            return (
              <View key={item.id} style={{paddingVertical:8, borderBottomWidth:1, borderBottomColor:C.brd}}>
                <Text style={{color:C.txt, fontWeight:'700'}}>{ref?.icon} {ref?.name || 'Atividade'}</Text>
                <Text style={{color:C.sub, marginTop:2}}>{fmtHM(item.minutes)} • {new Date(item.dateISO).toLocaleDateString()} {new Date(item.dateISO).toLocaleTimeString().slice(0,5)}</Text>
                {item.note ? <Text style={{color:C.sub, marginTop:4}}>{item.note}</Text> : null}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

function ProgramsScreen({ habits, onCreate, onUpdate, onDelete, goals, onGoalCreate, onGoalDelete, agg }){
  const C = useColors();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("420");
  const [icon, setIcon] = useState("✅");
  const [color, setColor] = useState("#5B8CFF");
  const [editId, setEditId] = useState(null);
  const [editTarget, setEditTarget] = useState("");

  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("120");
  const [goalHabit, setGoalHabit] = useState("total");

  const totalThisWeek = useMemo(()=>Object.values(agg.byHabit||{}).reduce((a,b)=>a+b,0), [agg]);

  const goalDetails = useMemo(()=> goals.map(goal=>{
    const refHabit = goal.habitId === 'total' ? null : habits.find(h=>h.id===goal.habitId);
    const progress = goal.habitId === 'total' ? totalThisWeek : Math.max(0, agg.byHabit?.[goal.habitId]||0);
    const pct = Math.min(100, Math.round(100 * progress/Math.max(1, goal.target||0)));
    const remaining = Math.max(0, (goal.target||0) - progress);
    return { goal, refHabit, progress, pct, remaining };
  }), [goals, habits, agg, totalThisWeek]);

  const submitHabit = ()=>{
    if (!name.trim()){ Alert.alert('Atividade inválida','Informe um nome.'); return; }
    onCreate({ name, target, icon, color });
    setName("");
    setTarget("420");
    setIcon("✅");
    setColor("#5B8CFF");
  };

  const submitGoal = ()=>{
    if (!goalTitle.trim()){ Alert.alert('Meta inválida','Informe um nome.'); return; }
    onGoalCreate({ title: goalTitle, target: goalTarget, habitId: goalHabit });
    setGoalTitle("");
    setGoalTarget("120");
  };

  return (
    <ScrollView contentContainerStyle={{paddingBottom:32}}>
      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Nova atividade</Text>
        <TextInput
          placeholder='Nome (ex: Leitura)'
          placeholderTextColor='#7d8fb0'
          value={name}
          onChangeText={setName}
          style={{backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginBottom:10}}
        />
        <View style={{flexDirection:'row', marginBottom:10}}>
          <TextInput
            placeholder='Meta semanal (min)'
            placeholderTextColor='#7d8fb0'
            keyboardType='numeric'
            value={target}
            onChangeText={setTarget}
            style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}
          />
          <TextInput
            placeholder='Ícone (emoji)'
            placeholderTextColor='#7d8fb0'
            value={icon}
            onChangeText={setIcon}
            style={{width:110, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, textAlign:'center'}}
          />
        </View>
        <View style={{flexDirection:'row'}}>
          <TextInput
            placeholder='Cor (#RRGGBB)'
            placeholderTextColor='#7d8fb0'
            value={color}
            onChangeText={setColor}
            style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}
          />
          <Btn title='Adicionar' onPress={submitHabit} />
        </View>
      </Card>

      {[...habits].sort((a,b)=>a.order-b.order).map(h=>(
        <Card key={h.id} style={{marginBottom:14, padding:20}}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <View style={{flex:1, paddingRight:12}}>
              <Text style={{color:C.txt, fontWeight:'900'}}>{h.icon} {h.name}</Text>
              <Text style={{color:C.sub, marginTop:4}}>Meta semanal: {fmtHM(h.target||0)}</Text>
            </View>
            {editId === h.id ? (
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <TextInput
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType='numeric'
                  placeholder='min'
                  placeholderTextColor='#7d8fb0'
                  style={{width:110, backgroundColor:C.chip, color:C.txt, padding:10, borderRadius:10, borderWidth:1, borderColor:C.brd, marginRight:8}}
                />
                <Btn
                  title='Salvar'
                  kind='good'
                  onPress={()=>{
                    const x = parseInt(editTarget,10);
                    if (isNaN(x)){ Alert.alert('Valor inválido','Digite um número.'); return; }
                    onUpdate(h.id, { target:x });
                    setEditId(null);
                  }}
                />
                <View style={{width:8}} />
                <Btn title='Cancelar' kind='chip' onPress={()=>setEditId(null)} />
              </View>
            ) : (
              <View style={{flexDirection:'row'}}>
                <Btn title='Editar meta' kind='chip' onPress={()=>{ setEditId(h.id); setEditTarget(String(h.target||0)); }} />
                <View style={{width:12}} />
                <Btn title='Excluir' kind='danger' onPress={()=>onDelete(h.id)} />
              </View>
            )}
          </View>
        </Card>
      ))}

      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Nova meta semanal</Text>
        <TextInput
          placeholder='Nome da meta'
          placeholderTextColor='#7d8fb0'
          value={goalTitle}
          onChangeText={setGoalTitle}
          style={{backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginBottom:10}}
        />
        <View style={{flexDirection:'row'}}>
          <TextInput
            placeholder='Minutos'
            placeholderTextColor='#7d8fb0'
            keyboardType='numeric'
            value={goalTarget}
            onChangeText={setGoalTarget}
            style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}
          />
          <Btn title='Criar meta' onPress={submitGoal} />
        </View>
        <Text style={{color:C.sub, marginTop:12, marginBottom:6}}>Aplicar a</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:'row'}}>
            {[{id:'total', name:'Todas'}, ...habits].map(h=>(
              <View key={h.id} style={{marginRight:8}}>
                <Tag label={h.id==='total' ? 'Todas' : `${h.icon} ${h.name}`} active={goalHabit===h.id} onPress={()=>setGoalHabit(h.id)} />
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>

      <Card style={{padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Metas em andamento</Text>
        {goalDetails.length === 0 ? (
          <Text style={{color:C.sub}}>Nenhuma meta cadastrada.</Text>
        ) : (
          goalDetails.map(({goal, refHabit, progress, pct, remaining})=>(
            <View key={goal.id} style={{marginBottom:14, borderBottomWidth:1, borderBottomColor:C.brd, paddingBottom:14}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:6}}>
                <View style={{flex:1, paddingRight:12}}>
                  <Text style={{color:C.txt, fontWeight:'900'}}>{goal.title}</Text>
                  <Text style={{color:C.sub, fontSize:12}}>{goal.habitId === 'total' ? 'Todas as atividades' : refHabit ? `${refHabit.icon} ${refHabit.name}` : 'Atividade removida'}</Text>
                </View>
                <Pressable onPress={()=>onGoalDelete(goal.id)}><Text style={{color:C.bad, fontWeight:'700'}}>Excluir</Text></Pressable>
              </View>
              <Bar value={progress} total={goal.target||0} color={refHabit?.color || C.acc} />
              <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:6}}>
                <Text style={{color:C.sub, fontSize:12}}>Progresso: {fmtHM(progress)} / {fmtHM(goal.target||0)}</Text>
                <Text style={{color:C.sub, fontSize:12}}>{pct}%</Text>
              </View>
              <Text style={{color:C.sub, fontSize:12, marginTop:4}}>Faltam {fmtHM(remaining)}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function StatisticsScreen({ habits, sessions, cursor, setCursor, onAdd }){
  const C = useColors();
  const start = useMemo(()=>{ const d = weekStart(); d.setDate(d.getDate() - cursor*7); return d; }, [cursor]);
  const { byHabit, dailyTotal } = useMemo(()=>aggregateWeek(sessions, habits, start), [sessions, habits, start]);
  const rows = habits.map(h=>({ name:h.name, mins:Math.max(0, byHabit[h.id]||0), target:h.target||0, color:h.color }));
  const history = useMemo(()=>buildHistory(sessions, habits, 12), [sessions, habits]);
  const [compareHabit, setCompareHabit] = useState('total');
  const [weekA, setWeekA] = useState(Math.max(history.length-1,0));
  const [weekB, setWeekB] = useState(Math.max(history.length-2,0));

  useEffect(()=>{
    if (compareHabit !== 'total' && !habits.find(h=>h.id===compareHabit)){
      setCompareHabit('total');
    }
  }, [compareHabit, habits]);

  useEffect(()=>{
    if (!history[weekA]) setWeekA(Math.max(history.length-1,0));
    if (!history[weekB]) setWeekB(Math.max(history.length-2,0));
  }, [history, weekA, weekB]);

  const detailWeekA = useMemo(()=> history[weekA] ? aggregateWeek(sessions, habits, history[weekA].start) : null, [history, weekA, sessions, habits]);
  const detailWeekB = useMemo(()=> history[weekB] ? aggregateWeek(sessions, habits, history[weekB].start) : null, [history, weekB, sessions, habits]);

  const baseSeries = new Array(7).fill(0);
  const seriesA = compareHabit === 'total'
    ? (detailWeekA?.dailyTotal || baseSeries)
    : (detailWeekA?.dailyByHabit.map(day=>Math.max(0, day[compareHabit]||0)) || baseSeries);
  const seriesB = compareHabit === 'total'
    ? (detailWeekB?.dailyTotal || baseSeries)
    : (detailWeekB?.dailyByHabit.map(day=>Math.max(0, day[compareHabit]||0)) || baseSeries);

  const habitInfo = compareHabit === 'total' ? null : habits.find(h=>h.id===compareHabit);
  const primaryColor = habitInfo?.color || C.acc;
  const secondaryColor = hexToRgba(primaryColor, 0.35);
  const totalWeek = rows.reduce((a,r)=>a+r.mins,0);
  const avgPerDay = Math.round(totalWeek/7);
  const bestIdx = dailyTotal.indexOf(Math.max(...dailyTotal));
  const bestDay = bestIdx>=0 ? shortDow[bestIdx] : '-';
  const overallStreak = useMemo(()=>{
    let count=0; let cur = weekStart();
    while(true){
      const ag = aggregateWeek(sessions, habits, cur);
      const target = habits.reduce((a,h)=>a+(h.target||0),0);
      const done = Object.values(ag.byHabit).reduce((a,b)=>a+b,0);
      if (target>0 && done>=target){ count++; cur = addDays(cur, -7); if (count>52) break; }
      else break;
    }
    return count;
  }, [sessions, habits]);

  return (
    <ScrollView contentContainerStyle={{paddingBottom:32}}>
      <View style={{flexDirection:'row', marginBottom:12}}>
        <Btn title='< Semana' kind='chip' onPress={()=>setCursor(cursor+1)} />
        <View style={{width:8}} />
        <Btn title='Semana >' kind='chip' onPress={()=>setCursor(Math.max(0, cursor-1))} />
      </View>

      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, marginBottom:8}}>Semana {fmtDate(start)} a {fmtDate(addDays(start,6))}</Text>
        <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:12}}>
          <SummaryPill label='Total' value={fmtHM(totalWeek)} />
          <SummaryPill label='Média/dia' value={fmtHM(avgPerDay)} />
          <SummaryPill label='Melhor dia' value={bestDay} />
          <SummaryPill label='Streak 100%' value={String(overallStreak)} />
        </View>
        {rows.map((r,i)=>(
          <View key={i} style={{marginBottom:12}}>
            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
              <Text style={{color:C.txt, fontWeight:'900'}}>{r.name}</Text>
              <Text style={{color:C.sub}}>{fmtHM(r.mins)} / {fmtHM(r.target)}</Text>
            </View>
            <Bar value={r.mins} total={r.target} color={r.color} />
          </View>
        ))}
        <View style={{marginTop:16, paddingTop:16, borderTopWidth:1, borderTopColor:C.brd}}>
          <ActivityLogger habits={habits} onAdd={onAdd} title="Registrar atividade" />
        </View>
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Intensidade da semana</Text>
        <HeatmapWeek totals={dailyTotal} />
      </Card>

      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:8}}>Comparar semanas por atividade</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:'row'}}>
            {[{id:'total', name:'Todas'}, ...habits].map(h=>(
              <View key={h.id} style={{marginRight:8}}>
                <Tag label={h.id==='total' ? 'Todas' : `${h.icon} ${h.name}`} active={compareHabit===h.id} onPress={()=>setCompareHabit(h.id)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={{color:C.sub, marginTop:12, marginBottom:6}}>Semana principal</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:'row'}}>
            {history.map((w,i)=>(
              <View key={`primary-${i}`} style={{marginRight:8}}>
                <Tag label={monthDay(w.start)} active={weekA===i} onPress={()=>setWeekA(i)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={{color:C.sub, marginTop:12, marginBottom:6}}>Semana para comparação</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:'row'}}>
            {history.map((w,i)=>(
              <View key={`secondary-${i}`} style={{marginRight:8}}>
                <Tag label={monthDay(w.start)} active={weekB===i} onPress={()=>setWeekB(i)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{marginTop:16}}>
          <CompareChart seriesA={seriesA} seriesB={seriesB} colorA={primaryColor} colorB={secondaryColor} />
          <Text style={{color:C.sub, marginTop:8, fontSize:12}}>
            Semana {history[weekA] ? fmtDate(history[weekA].start) : '-'} vs {history[weekB] ? fmtDate(history[weekB].start) : '-'}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

function SettingsScreen({ prefs, onPrefsChange, onThemeChange, themeName }){
  const C = useColors();
  const [notifyHourField, setNotifyHourField] = useState(String(prefs.notifyHour));

  useEffect(()=>{
    setNotifyHourField(String(prefs.notifyHour));
  }, [prefs.notifyHour]);

  const themeOptions = useMemo(()=>Object.keys(THEMES).map(key=>({ id:key, label:key.charAt(0).toUpperCase()+key.slice(1) })), []);

  return (
    <ScrollView contentContainerStyle={{paddingBottom:32}}>
      <Card style={{marginBottom:16, padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Tema</Text>
        <Text style={{color:C.sub, marginBottom:12}}>Escolha a paleta de cores preferida para o aplicativo.</Text>
        <View style={{flexDirection:'row', flexWrap:'wrap'}}>
          {themeOptions.map(opt=>(
            <View key={opt.id} style={{marginRight:8, marginBottom:8}}>
              <OptionPill
                label={opt.label}
                active={themeName===opt.id}
                onPress={()=>onThemeChange(opt.id)}
                color={THEMES[opt.id].acc}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card style={{padding:20}}>
        <Text style={{color:C.sub, fontWeight:'700', marginBottom:12}}>Notificações</Text>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <Text style={{color:C.txt, fontWeight:'700'}}>Lembrar diariamente</Text>
          <Switch
            value={prefs.notificationsEnabled}
            onValueChange={(v)=>onPrefsChange(prev=>({...prev, notificationsEnabled:v }))}
            thumbColor={prefs.notificationsEnabled?C.acc:'#f4f3f4'}
            trackColor={{false:'#3b4763', true:'#233d6b'}}
          />
        </View>
        <Text style={{color:C.sub, marginBottom:6}}>Horário (0-23h)</Text>
        <TextInput
          placeholder='Hora'
          placeholderTextColor='#7d8fb0'
          keyboardType='numeric'
          value={notifyHourField}
          onChangeText={setNotifyHourField}
          onEndEditing={()=>{
            const n = clamp(parseInt(notifyHourField||'0',10),0,23);
            setNotifyHourField(String(n));
            onPrefsChange(prev=>({...prev, notifyHour:n }));
          }}
          style={{backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd}}
        />
        {Platform.OS === 'ios' || Platform.OS === 'android' ? (
          <Text style={{color:C.sub, fontSize:12, marginTop:8}}>As notificações são agendadas localmente neste horário.</Text>
        ) : (
          <Text style={{color:C.warn, fontSize:12, marginTop:8}}>Notificações podem não estar disponíveis nesta plataforma.</Text>
        )}
      </Card>
    </ScrollView>
  );
}

function WaterTracker({ value, onChange }){
  const C = useColors();
  const bottles = Math.max(0, value?.bottles || 0);
  const progress = clamp(value?.progress ?? 0, 0, 1);
  const progressPct = Math.round(progress * 100);
  const options = [
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: 'Completar', value: 1 },
  ];

  const applyChange = useCallback((updater)=>{
    if (!onChange) return;
    if (typeof updater === 'function') onChange(updater);
    else onChange(()=>updater);
  }, [onChange]);

  const handleStepPress = useCallback((stepValue)=>{
    applyChange(prev=>{
      const base = prev || { bottles:0, progress:0 };
      const currentProgress = clamp(base.progress||0, 0, 1);
      if (stepValue >= 1){
        return { bottles: (base.bottles||0) + 1, progress: 0 };
      }
      const sameStep = Math.abs(currentProgress - stepValue) < 0.05;
      return { ...base, progress: sameStep ? 0 : stepValue };
    });
  }, [applyChange]);

  const handleReset = useCallback(()=>{
    applyChange(prev=>({ ...(prev||{}), progress:0 }));
  }, [applyChange]);

  return (
    <View style={{backgroundColor:C.dimStrong||C.dim, borderRadius:16, padding:16, borderWidth:1, borderColor:C.brd}}>
      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
        <Text style={{color:C.sub, fontWeight:'700'}}>Garrafa atual</Text>
        <Text style={{color:C.txt, fontWeight:'800'}}>{progressPct}%</Text>
      </View>
      <View style={{height:12, borderRadius:999, backgroundColor:C.card, overflow:'hidden', marginTop:12}}>
        <View style={{width:`${Math.round(progress*100)}%`, height:'100%', backgroundColor:C.acc}} />
      </View>
      <Text style={{color:C.sub, marginTop:12}}>Toque em uma fração para registrar rapidamente.</Text>
      <View style={{flexDirection:'row', flexWrap:'wrap', marginTop:12}}>
        {options.map((opt, index)=>{
          const isComplete = opt.value >= 1;
          const isActive = !isComplete && progress >= opt.value - 0.001;
          const baseStyle = {
            flexBasis: isComplete ? '100%' : '48%',
            marginRight: isComplete ? 0 : (index % 2 === 0 ? 8 : 0),
            marginBottom:8,
            paddingVertical:12,
            borderRadius:12,
            borderWidth:1,
            alignItems:'center',
          };
          return (
            <Pressable
              key={opt.label}
              onPress={()=>handleStepPress(opt.value)}
              style={({pressed})=>({
                ...baseStyle,
                backgroundColor: isComplete
                  ? (pressed ? hexToRgba(C.acc,0.7) : C.acc)
                  : isActive
                    ? hexToRgba(C.acc,0.16)
                    : (pressed ? C.dim : C.card),
                borderColor: isComplete || isActive ? C.acc : C.brd,
              })}
            >
              <Text style={{color:isComplete ? 'white' : (isActive ? C.txt : C.sub), fontWeight:'700'}}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {progress > 0 ? (
        <Pressable
          onPress={handleReset}
          style={({pressed})=>({
            marginTop:4,
            alignSelf:'flex-start',
            paddingVertical:8,
            paddingHorizontal:12,
            borderRadius:10,
            borderWidth:1,
            borderColor:C.brd,
            backgroundColor: pressed ? C.dim : C.card,
          })}
        >
          <Text style={{color:C.sub, fontWeight:'700'}}>Zerar garrafa atual</Text>
        </Pressable>
      ) : null}
      <Text style={{color:C.sub, marginTop:12}}>Total acumulado: {bottles} garrafas</Text>
    </View>
  );
}
function HeatmapWeek({ totals }){
  const C = useColors();
  const max = Math.max(...totals, 1);
  return (
    <View style={{flexDirection:"row", justifyContent:"space-between"}}>
      {totals.map((v,i)=>{
        const op = Math.max(0.15, v/max);
        return (
          <View key={i} style={{alignItems:"center", width:`${100/7}%`}}>
            <View style={{width:26, height:26, borderRadius:6, backgroundColor:hexToRgba(C.acc, op), borderWidth:1, borderColor:C.brd}} />
            <Text style={{color:C.sub, fontSize:12, marginTop:6}}>{shortDow[i]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CompareChart({ seriesA, seriesB, colorA, colorB }){
  const C = useColors();
  const max = Math.max(...seriesA, ...seriesB, 1);
  return (
    <View style={{flexDirection:"row", alignItems:"flex-end", height:120}}>
      {seriesA.map((_, idx)=>{
        const valueA = seriesA[idx]||0;
        const valueB = seriesB[idx]||0;
        const heightA = Math.round((valueA/Math.max(1,max))*100);
        const heightB = Math.round((valueB/Math.max(1,max))*100);
        return (
          <View key={idx} style={{flex:1, alignItems:"center"}}>
            <View style={{width:"100%", height:100, position:"relative", justifyContent:"flex-end"}}>
              <View style={{position:"absolute", bottom:0, left:"50%", marginLeft:-12, width:24, height:heightB, backgroundColor:colorB, borderRadius:8}} />
              <View style={{position:"absolute", bottom:0, left:"50%", marginLeft:-8, width:16, height:heightA, backgroundColor:colorA, borderRadius:8}} />
            </View>
            <Text style={{color:C.sub, fontSize:12, marginTop:6}}>{shortDow[idx]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function BottomTabs({ current, onSelect, items }){
  const C = useColors();
  return (
    <View style={{paddingHorizontal:24, paddingTop:12, paddingBottom:24, backgroundColor:C.card, borderTopWidth:1, borderTopColor:C.brd}}>
      <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"flex-end"}}>
        {items.map(item=>{
          const active = current === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={()=>onSelect(item.id)}
              style={({pressed})=>({
                flex:1,
                marginHorizontal:4,
                alignItems:"center",
                paddingVertical: active ? 10 : 6,
                borderRadius:18,
                backgroundColor: active ? hexToRgba(C.acc,0.22) : pressed ? C.dim : 'transparent',
                transform:[{translateY: active ? -4 : 0}]
              })}
            >
              <Text style={{fontSize: active ? 22 : 20, marginBottom:4}}>{item.icon}</Text>
              <Text style={{color: active ? C.acc : C.sub, fontSize:12, fontWeight: active ? "800" : "600", letterSpacing:0.4}}>{item.label}</Text>
              {active ? <View style={{width:6, height:6, borderRadius:3, backgroundColor:C.acc, marginTop:6}} /> : <View style={{height:6}} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ---------------------- helpers ---------------------- */
function buildCSV(habits, sessions){
  const hmap = Object.fromEntries(habits.map(h=>[h.id, h.name]));
  const head = "date,habit,minutes,note";
  const rows = sessions.map(s=>{
    const d = new Date(s.dateISO);
    const date = d.toISOString();
    const habit = (hmap[s.habitId]||"");
    const mins = s.minutes||0;
    const note = (s.note||"").replace(/"/g,'""');
    return `${date},"${habit}",${mins},"${note}"`;
  });
  return [head, ...rows].join("\n");
}
function fmtDate(d){ const dd = new Date(d); const a=("0"+dd.getDate()).slice(-2), b=("0"+(dd.getMonth()+1)).slice(-2); return `${a}/${b}`; }
function buildGoalNotificationBody(goals, agg){
  if (!goals?.length) return "Nenhuma meta cadastrada.";
  const total = Object.values(agg.byHabit||{}).reduce((a,b)=>a+b,0);
  return goals.map(goal=>{
    const progress = goal.habitId === "total" ? total : Math.max(0, agg.byHabit?.[goal.habitId]||0);
    const pct = Math.min(100, Math.round(100 * progress/Math.max(1, goal.target||0)));
    return `${goal.title}: ${pct}%`;
  }).join(" • ");
}
async function ensureNotificationPermission(){
  try {
    if (!Device.isDevice) return false;
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
    const request = await Notifications.requestPermissionsAsync();
    return request.granted || request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch (err) {
    return false;
  }
}
