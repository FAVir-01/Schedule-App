import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, TextInput, Pressable, ScrollView, Alert, Share, Switch, Platform } from "react-native";
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
const C = { bg:"#0B1220", card:"#11192b", txt:"#E7ECF5", sub:"#9FB0C9", acc:"#5B8CFF", good:"#18C08F", warn:"#FFB020", bad:"#FF6B6B", chip:"#1a263e", brd:"#23324a", dim:"#1b2945" };
const P = 16;
const monthNamesShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const uid = () => Math.random().toString(36).slice(2,10);
const clamp = (n, a, b) => Math.max(a, Math.min(n, b));
const fmtHM = (mins)=>`${Math.floor(Math.abs(mins)/60)}h ${Math.abs(mins)%60}m${mins<0?" (-)":""}`;
const weekStart = (d=new Date()) => { const x=new Date(d); const g=x.getDay(); const diff=(g===0?-6:1)-g; x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x; };
const addDays = (d, n)=> new Date(d.getTime()+n*86400000);
const shortDow = ["M","T","W","T","F","S","S"]; // monday..sunday
const monthDay = (d)=>{const x=new Date(d); return ("0"+x.getDate()).slice(-2)+"/"+("0"+(x.getMonth()+1)).slice(-2);};

const hexToRgba = (hex, alpha=1)=>{
  if (!hex) return `rgba(255,255,255,${alpha})`;
  const normalized = hex.replace("#","");
  const size = normalized.length===3 ? 1 : 2;
  const parse = (start)=>{
    const segment = normalized.substr(start, size);
    const full = size===1 ? segment.repeat(2) : segment;
    return parseInt(full,16)||0;
  };
  const r = parse(0);
  const g = parse(size);
  const b = parse(size*2);
  return `rgba(${r},${g},${b},${alpha})`;
};

const Card = ({children,style}) => <View style={[{backgroundColor:C.card,borderRadius:18,padding:14,borderWidth:1,borderColor:C.brd},style]}>{children}</View>;
const Btn = ({title,onPress,kind="primary",style})=>{
  const map={primary:C.acc, good:C.good, danger:C.bad, chip:C.chip};
  const bg = map[kind] || C.acc;
  return <Pressable onPress={onPress} style={({pressed})=>[{backgroundColor:bg,opacity:pressed?0.9:1,paddingVertical:12,paddingHorizontal:16,borderRadius:12,alignItems:"center"},style]}><Text style={{color:"white",fontWeight:"800"}}>{title}</Text></Pressable>;
};
const Tag = ({active,label,onPress})=>(
  <Pressable onPress={onPress} style={({pressed})=>({backgroundColor:active?C.acc:(pressed?"#22304c":"#1a263e"), paddingVertical:8, paddingHorizontal:12, borderRadius:12, borderWidth:1, borderColor:C.brd})}>
    <Text style={{color:"white", fontWeight:"800"}}>{label}</Text>
  </Pressable>
);
const Chip = ({title,onPress}) => (
  <Pressable onPress={onPress} style={({pressed})=>({backgroundColor:pressed?"#22304c":"#1a263e", paddingVertical:8, paddingHorizontal:10, borderRadius:10, borderWidth:1, borderColor:C.brd})}>
    <Text style={{color:C.txt, fontWeight:"700"}}>{title}</Text>
  </Pressable>
);
const OptionPill = ({active,label,onPress,color,style}) => (
  <Pressable
    onPress={onPress}
    style={({pressed})=>({
      paddingVertical:6,
      paddingHorizontal:14,
      borderRadius:999,
      backgroundColor: active ? hexToRgba(color||C.acc,0.16) : pressed ? "#1b2945" : "#111a2d",
      borderWidth:1,
      borderColor: active ? color||C.acc : C.brd,
    }, style)}
  >
    <Text style={{color: active ? (color||C.acc) : C.sub, fontWeight:"700", fontSize:12}}>{label}</Text>
  </Pressable>
);
const TrendChart = ({series,color=C.acc,height=160})=>{
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
        style={{height, position:"relative"}}
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
              backgroundColor: hexToRgba(color, 0.16),
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
              backgroundColor: color,
              borderRadius:999,
              shadowColor: color,
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
            <View style={{width:10, height:10, borderRadius:5, backgroundColor:color}} />
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
const Bar = ({value,total,color})=>{
  const pct = Math.min(100, Math.round((value/Math.max(1,total))*100));
  return <View style={{height:12, backgroundColor:C.dim, borderRadius:999, overflow:"hidden"}}>
    <View style={{width:`${pct}%`, height:"100%", backgroundColor:color||C.acc}}/>
  </View>;
};
const Stat = ({label,value})=>(
  <View style={{alignItems:"center"}}>
    <Text style={{color:C.txt, fontWeight:"800"}}>{value}</Text>
    <Text style={{color:C.sub, fontSize:12}}>{label}</Text>
  </View>
);

/* ---------------------- Storage ---------------------- */
const K = { HABITS:"HABITS", SESS:"SESSIONS", PREFS:"PREFS", GOALS:"GOALS" };
const DEFAULT_PREFS = { showBackup:false, notificationsEnabled:false, notifyHour:20 };
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
}

function aggregateWeek(sessions, habits, startDate){
  const start = weekStart(startDate);
  const end = addDays(start, 7);

  const byHabit = {}; habits.forEach(h=>byHabit[h.id]=0);
  const dailyByHabit = Array.from({length:7}, ()=> ({}));
  const dailyTotal = Array.from({length:7}, ()=> 0);

  sessions.forEach(s=>{
    const d = new Date(s.dateISO);
    if (d>=start && d<end){
      const idx = Math.floor((d-start)/86400000);
      const mins = s.minutes||0;
      byHabit[s.habitId] = (byHabit[s.habitId]||0) + mins;
      dailyByHabit[idx][s.habitId] = (dailyByHabit[idx][s.habitId]||0) + mins;
      dailyTotal[idx] += mins;
    }
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

  useEffect(()=>{ (async()=>{
    await ensureSeed();
    setHabits(await load(K.HABITS, []));
    setSess(await load(K.SESS, []));
    setGoals(await load(K.GOALS, []));
    const storedPrefs = await load(K.PREFS, DEFAULT_PREFS);
    setPrefs({...DEFAULT_PREFS, ...storedPrefs});
  })(); },[]);

  const agg = useMemo(()=>aggregateWeek(sessions, habits, new Date()), [sessions, habits]);
  const totalTarget = habits.reduce((a,h)=>a+(h.target||0),0);
  const totalDone = Object.values(agg.byHabit).reduce((a,b)=>a+b,0);
  const weekScore = habits.length ? Math.round(100 * (Object.entries(agg.byHabit).filter(([id, mins]) => mins >= (habits.find(h=>h.id===id)?.target||0)).length / habits.length)) : 0;
  const history8 = useMemo(()=>buildHistory(sessions, habits, 8), [sessions, habits]);
  const notificationBody = useMemo(()=>buildGoalNotificationBody(goals, agg), [goals, agg]);

  const updatePrefs = useCallback(async (next)=>{
    const base = typeof next === "function" ? next(prefs) : next;
    const finalPrefs = { ...DEFAULT_PREFS, ...prefs, ...base };
    setPrefs(finalPrefs);
    await save(K.PREFS, finalPrefs);
    return finalPrefs;
  }, [prefs]);

  /* ------ actions ------ */
  const addMinutes = async (habitId, mins, note="")=>{
    if (!habitId || !mins || isNaN(mins)) return;
    const m = parseInt(mins,10);
    if (m === 0) return;
    const all = await load(K.SESS, []);
    all.push({ id: uid(), habitId, dateISO: new Date().toISOString(), minutes: m, note });
    await save(K.SESS, all);
    setSess(all);
  };

  const deleteSession = async (id)=>{
    const all = (await load(K.SESS, [])).filter(s=>s.id!==id);
    await save(K.SESS, all); setSess(all);
  };

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
    const label = dayNames[date.getDay()].charAt(0);
    const isToday = date.toDateString() === today.toDateString();
    return { date, label, isToday };
  });

  const navItems = useMemo(()=>[
    { id:"log", label:"Days", icon:"📅" },
    { id:"habits", label:"Programs", icon:"🎯" },
    { id:"dashboard", label:"Journal", icon:"📔" },
    { id:"reports", label:"Statistics", icon:"📊" },
    { id:"goals", label:"Profile", icon:"👤" },
  ], []);

  const currentDayName = dayNames[today.getDay()];
  const currentDateLabel = `${("0"+today.getDate()).slice(-2)} ${monthNamesShort[today.getMonth()]}`;

  return (
    <SafeAreaView style={{flex:1, backgroundColor: C.bg}}>
      <View style={{flex:1}}>
        <View style={{paddingHorizontal:P, paddingTop:P}}>
          <View style={{marginBottom:16}}>
            <Text style={{color:C.sub, fontSize:12, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>Today</Text>
            <Text style={{color:C.txt, fontSize:30, fontWeight:"900"}}>{currentDayName}</Text>
            <Text style={{color:C.sub, fontSize:18, fontWeight:"700"}}>{currentDateLabel}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:16, paddingBottom:4}}>
            <View style={{flexDirection:"row"}}>
              {dayItems.map((item, index)=>{
                const isActive = item.date.toDateString() === selectedKey;
                return (
                  <Pressable
                    key={index}
                    onPress={()=>setSelectedDate(new Date(item.date))}
                    style={({pressed})=>({
                      marginRight:10,
                      width:44,
                      height:60,
                      borderRadius:18,
                      alignItems:"center",
                      justifyContent:"center",
                      backgroundColor: isActive ? hexToRgba(C.acc,0.2) : pressed ? "#111a2d" : "#0f182b",
                      borderWidth: isActive ? 2 : 1,
                      borderColor: isActive ? C.acc : C.brd,
                    })}
                  >
                    <Text style={{color:isActive?C.acc:C.sub, fontWeight:"800", fontSize:12, marginBottom:4}}>{item.label}</Text>
                    <Text style={{color:isActive?C.txt:C.sub, fontWeight:"900", fontSize:16}}>{("0"+item.date.getDate()).slice(-2)}</Text>
                    {item.isToday && !isActive ? (
                      <View style={{position:"absolute", bottom:6, width:6, height:6, borderRadius:3, backgroundColor:C.acc}} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={{flex:1, paddingHorizontal:P, paddingBottom:96}}>
          {tab==="dashboard" && (
            <Dashboard
              habits={habits}
              agg={agg}
              totalDone={totalDone}
              totalTarget={totalTarget}
              weekScore={weekScore}
              history8={history8}
              goals={goals}
              onQuickAdd={addMinutes}
              selectedDate={selectedDate}
              sessions={sessions}
            />
          )}

          {tab==="log" && <LogScreen habits={habits} sessions={sessions} onAdd={addMinutes} onDelete={deleteSession} />}

          {tab==="habits" && <HabitsScreen habits={habits} onCreate={createHabit} onUpdate={updateHabit} onDelete={removeHabit} />}

          {tab==="goals" && <GoalsScreen habits={habits} goals={goals} agg={agg} prefs={prefs} onPrefsChange={updatePrefs} onCreate={createGoal} onDelete={deleteGoal} />}

          {tab==="reports" && <ReportsScreen habits={habits} sessions={sessions} cursor={cursor} setCursor={setCursor} prefs={prefs} setPrefs={updatePrefs} />}
        </View>
      </View>

      <BottomTabs current={tab} onSelect={setTab} items={navItems} />
    </SafeAreaView>
  );
}

/* ---------------------- sub-screens ---------------------- */

function Dashboard({ habits, agg, totalDone, totalTarget, weekScore, history8, goals, onQuickAdd, selectedDate, sessions }){
  const [trendFocus, setTrendFocus] = useState("total");
  const totalThisWeek = Object.values(agg.byHabit).reduce((a,b)=>a+b,0);
  const sortedByWeek = [...habits].map(h=>({ ...h, done: Math.max(0, agg.byHabit[h.id]||0) })).sort((a,b)=>b.done-a.done);
  const trendOptions = [{ id:"total", label:"Total", icon:"📊", color:C.acc }, ...sortedByWeek.slice(0,3).map(h=>({ id:h.id, label:h.name, icon:h.icon, color:h.color }))];
  useEffect(()=>{
    if (trendFocus!=="total" && !habits.find(h=>h.id===trendFocus)){
      setTrendFocus("total");
    }
  }, [trendFocus, habits]);
  const focusMeta = trendOptions.find(opt=>opt.id===trendFocus) || trendOptions[0];
  const trendSeries = useMemo(()=>{
    if (trendFocus === "total"){
      return history8.map(week=>({ label: monthDay(week.start), value: week.total }));
    }
    return history8.map(week=>({
      label: monthDay(week.start),
      value: week.byHabit.find(item=>item.id===trendFocus)?.mins || 0,
    }));
  }, [history8, trendFocus]);
  const trendColor = focusMeta?.color || C.acc;

  const dayStart = useMemo(()=>{ const d = new Date(selectedDate||new Date()); d.setHours(0,0,0,0); return d; }, [selectedDate]);
  const dayEnd = useMemo(()=>addDays(dayStart, 1), [dayStart]);
  const sessionsForDay = useMemo(()=> sessions.filter(s=>{ const d=new Date(s.dateISO); return d>=dayStart && d<dayEnd; }), [sessions, dayStart, dayEnd]);
  const dayByHabit = useMemo(()=>{
    const map={};
    sessionsForDay.forEach(s=>{
      const amount = Math.max(0, s.minutes||0);
      if (amount<=0) return;
      map[s.habitId] = (map[s.habitId]||0) + amount;
    });
    return map;
  }, [sessionsForDay]);
  const dayBreakdown = useMemo(()=>{
    return Object.entries(dayByHabit).map(([id,value])=>{
      const ref = habits.find(h=>h.id===id);
      return { id, value, icon:ref?.icon||"", name:ref?.name||"", color:ref?.color||C.acc };
    }).sort((a,b)=>b.value-a.value);
  }, [dayByHabit, habits]);
  const dayTotal = dayBreakdown.reduce((a,b)=>a+b.value,0);
  const firstItem = dayBreakdown[0];
  const secondItem = dayBreakdown[1];
  const awakeMins = Math.max(0, dayTotal - (firstItem?.value||0));
  const sleepMins = firstItem?.value || 0;
  const deepMins = secondItem?.value || 0;
  const highlightLabel = firstItem ? `${firstItem.icon} ${firstItem.name}` : "Sem registros";

  const completionPct = Math.min(100, Math.round(100*totalDone/Math.max(1,totalTarget)));
  const latestValue = trendSeries[trendSeries.length-1]?.value || 0;
  const prevValue = trendSeries.length>1 ? trendSeries[trendSeries.length-2].value : 0;
  const delta = latestValue - prevValue;
  const diffLabel = delta===0 ? fmtHM(0) : `${delta>=0?"+":"-"}${fmtHM(Math.abs(delta)).replace(" (-)","")}`;
  const deltaColor = delta>=0 ? C.good : C.bad;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:32}}>
      <Card style={{marginBottom:16, padding:20, backgroundColor:"#111b30"}}>
        <View style={{flexDirection:"row", alignItems:"center"}}>
          <View style={{width:110, height:110, borderRadius:55, borderWidth:4, borderColor:hexToRgba(C.acc,0.45), alignItems:"center", justifyContent:"center", backgroundColor:hexToRgba(C.acc,0.12), marginRight:20}}>
            <Text style={{color:C.txt, fontSize:34, fontWeight:"900"}}>{weekScore}%</Text>
            <Text style={{color:C.sub, fontWeight:"700", fontSize:12, letterSpacing:1}}>QUALITY</Text>
          </View>
          <View style={{flex:1}}>
            <Text style={{color:C.sub, fontSize:12, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>Highlight</Text>
            <Text style={{color:C.txt, fontSize:22, fontWeight:"900", marginTop:2}}>{highlightLabel}</Text>
            <Text style={{color:C.sub, marginTop:4}}>Semana atual • {fmtDate(agg.start)} - {fmtDate(addDays(agg.start,6))}</Text>
            <View style={{marginTop:16}}>
              <View style={{flexDirection:"row", justifyContent:"space-between", marginBottom:10}}>
                <SummaryPill label="In bed" value={fmtHM(dayTotal)} />
                <SummaryPill label="Asleep" value={fmtHM(sleepMins)} />
                <SummaryPill label="Deep" value={fmtHM(deepMins)} />
              </View>
              <View style={{flexDirection:"row", justifyContent:"space-between"}}>
                <SummaryPill label="Awake" value={fmtHM(awakeMins)} />
                <SummaryPill label="Meta" value={`${completionPct}%`} compact />
                <SummaryPill label="Total" value={fmtHM(totalDone)} compact />
              </View>
            </View>
          </View>
        </View>
      </Card>

      <Card style={{marginBottom:16, padding:20, backgroundColor:"#101a2d"}}>
        <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <View>
            <Text style={{color:C.sub, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>Short night/nap</Text>
            <Text style={{color:C.txt, fontSize:22, fontWeight:"900"}}>{focusMeta?.icon || ""} {focusMeta?.label || "Total"}</Text>
          </View>
          <View style={{alignItems:"flex-end"}}>
            <Text style={{color:deltaColor, fontWeight:"800", fontSize:16}}>{diffLabel}</Text>
            <Text style={{color:C.sub, fontSize:12}}>vs período anterior</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:12}}>
          <View style={{flexDirection:"row", marginBottom:12}}>
            {trendOptions.map(opt=>(
              <View key={opt.id} style={{marginRight:8}}>
                <OptionPill
                  active={trendFocus===opt.id}
                  label={`${opt.icon||""} ${opt.label}`.trim()}
                  onPress={()=>setTrendFocus(opt.id)}
                  color={opt.color}
                />
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{backgroundColor:"#0d1526", borderRadius:18, padding:12}}>
          <TrendChart series={trendSeries} color={trendColor} height={190} />
        </View>

        <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:14}}>
          <SummaryPill label="Awake" value={fmtHM(awakeMins)} />
          <SummaryPill label="Sleep" value={fmtHM(sleepMins)} />
          <SummaryPill label="Deep sleep" value={fmtHM(deepMins)} />
        </View>
      </Card>

      <Card style={{marginBottom:16, padding:18}}>
        <Text style={{color:C.sub, marginBottom:10, fontWeight:"700"}}>Metas da semana</Text>
        {goals.length === 0 ? (
          <Text style={{color:C.sub}}>Crie metas na aba Profile para monitorar aqui.</Text>
        ) : (
          goals.map(goal=>{
            const refHabit = goal.habitId === "total" ? null : habits.find(h=>h.id===goal.habitId);
            const progress = goal.habitId === "total" ? totalThisWeek : Math.max(0, agg.byHabit[goal.habitId]||0);
            const pct = Math.min(100, Math.round(100 * progress/Math.max(1, goal.target)));
            const remaining = Math.max(0, goal.target - progress);
            const color = refHabit?.color || C.acc;
            return (
              <View key={goal.id} style={{marginBottom:12, backgroundColor:"#0f182b", borderRadius:14, padding:12}}>
                <View style={{flexDirection:"row", justifyContent:"space-between", marginBottom:6}}>
                  <View style={{flex:1, paddingRight:8}}>
                    <Text style={{color:C.txt, fontWeight:"900"}}>{goal.title}</Text>
                    <Text style={{color:C.sub, fontSize:12}}>
                      {goal.habitId === "total" ? "Todas as atividades" : refHabit ? `${refHabit.icon} ${refHabit.name}` : "Atividade removida"}
                    </Text>
                  </View>
                  <Text style={{color:C.sub, fontSize:12}}>{pct}%</Text>
                </View>
                <Bar value={progress} total={goal.target} color={color}/>
                <Text style={{color:C.sub, fontSize:12, marginTop:6}}>Faltam {fmtHM(remaining)}</Text>
              </View>
            );
          })
        )}
      </Card>

      {[...habits].sort((a,b)=>a.order-b.order).map(h=>{
        const done = agg.byHabit[h.id]||0;
        const pct = Math.min(100, Math.round(100*done/Math.max(1,h.target||0)));
        return (
          <Card key={h.id} style={{marginBottom:14, padding:18}}>
            <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
              <View>
                <Text style={{color:h.color, fontWeight:"900", fontSize:18}}>{h.icon} {h.name}</Text>
                <Text style={{color:C.sub, fontSize:12}}>{fmtHM(done)} / {fmtHM(h.target||0)}</Text>
              </View>
              <View style={{alignItems:"flex-end"}}>
                <Text style={{color:C.sub, fontSize:12}}>Meta</Text>
                <Text style={{color:C.txt, fontWeight:"800"}}>{pct}%</Text>
              </View>
            </View>
            <Bar value={done} total={h.target||0} color={h.color}/>
            <View style={{flexDirection:"row", marginTop:12, flexWrap:"wrap"}}>
              {["+15m","+30m","+60m","-5m","-15m","-30m"].map((t,i)=>(
                <View key={i} style={{marginRight:8, marginBottom:8}}>
                  <Chip
                    title={t}
                    onPress={()=>{
                      const map={"+15m":15,"+30m":30,"+60m":60,"-5m":-5,"-15m":-15,"-30m":-30};
                      onQuickAdd(h.id, map[t]);
                    }}
                  />
                </View>
              ))}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const SummaryPill = ({ label, value, compact }) => (
  <View style={{backgroundColor:"#0f182b", borderRadius:14, paddingVertical:10, paddingHorizontal:12, borderWidth:1, borderColor:"#1a2944", minWidth: compact ? 78 : 86}}>
    <Text style={{color:C.sub, fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:1}}>{label}</Text>
    <Text style={{color:C.txt, fontWeight:"900", fontSize:compact?16:18, marginTop:4}}>{value}</Text>
  </View>
);

function LogScreen({ habits, sessions, onAdd, onDelete }){
  const [selected, setSelected] = useState(habits[0]?.id || null);
  const [mins, setMins] = useState("");
  const [note, setNote] = useState("");

  useEffect(()=>{ if (!selected && habits[0]) setSelected(habits[0].id); }, [habits]);

  const commit = (sign=1)=>{
    const m = parseInt(mins,10);
    if (!selected || isNaN(m) || m<=0) { Alert.alert("Minutos inválidos","Digite um número maior que zero."); return; }
    onAdd(selected, sign*m, note);
    setMins(""); setNote("");
  };

  const last10 = [...sessions].sort((a,b)=> new Date(b.dateISO)-new Date(a.dateISO)).slice(0,10);

  return (
    <ScrollView>
      <Card>
        <Text style={{color:C.sub, marginBottom:6}}>Escolha a atividade</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:4}}>
          <View style={{flexDirection:"row"}}>
            {habits.map(h=>(
              <View key={h.id} style={{marginRight:8}}>
                <Tag label={`${h.icon} ${h.name}`} active={selected===h.id} onPress={()=>setSelected(h.id)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{flexDirection:"row", marginTop:10, flexWrap:"wrap"}}>
          {["+15m","+30m","+60m","-5m","-15m","-30m"].map((t,i)=>(
            <View key={i} style={{marginRight:8, marginBottom:8}}>
              <Chip
                title={t}
                onPress={()=>{
                  const map={"+15m":15,"+30m":30,"+60m":60,"-5m":-5,"-15m":-15,"-30m":-30};
                  onAdd(selected, map[t], note);
                }}
              />
            </View>
          ))}
        </View>

        <Text style={{color:C.sub, marginTop:12}}>Ou adicione manualmente</Text>
        <View style={{flexDirection:"row", marginTop:6}}>
          <TextInput value={mins} onChangeText={setMins} placeholder="Minutos (ex: 37)" placeholderTextColor="#7d8fb0"
            keyboardType="numeric" style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}/>
          <Btn title="Adicionar" onPress={()=>commit(+1)} />
          <View style={{width:8}} />
          <Btn title="Remover" kind="danger" onPress={()=>commit(-1)} />
        </View>

        <Text style={{color:C.sub, marginTop:16, marginBottom:6}}>Últimos registros</Text>
        {last10.map(s=>{
          const h = habits.find(x=>x.id===s.habitId);
          return (
            <View key={s.id} style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8, padding:10, backgroundColor:"#0e1628", borderRadius:12, borderWidth:1, borderColor:C.brd}}>
              <Text style={{color:C.txt}}>{h?.icon} {h?.name} • {fmtHM(s.minutes)} • {new Date(s.dateISO).toLocaleTimeString().slice(0,5)}</Text>
              <Pressable onPress={()=>onDelete(s.id)}><Text style={{color:C.bad, fontWeight:"800"}}>Excluir</Text></Pressable>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

function HabitsScreen({ habits, onCreate, onUpdate, onDelete }){
  const [name, setName] = useState("");
  const [target, setTarget] = useState("420");
  const [icon, setIcon] = useState("✅");
  const [color, setColor] = useState("#5B8CFF");

  const [editId, setEditId] = useState(null);
  const [editTarget, setEditTarget] = useState("");

  return (
    <ScrollView>
      <Card style={{marginBottom:12}}>
        <Text style={{color:C.sub, marginBottom:8}}>Nova atividade</Text>
        <TextInput placeholder="Nome (ex: Leitura)" placeholderTextColor="#7d8fb0" value={name} onChangeText={setName}
          style={{backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginBottom:8}}/>
        <View style={{flexDirection:"row"}}>
          <TextInput placeholder="Meta semanal (min)" placeholderTextColor="#7d8fb0" value={target} onChangeText={setTarget} keyboardType="numeric"
            style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}/>
          <TextInput placeholder="Ícone (emoji)" placeholderTextColor="#7d8fb0" value={icon} onChangeText={setIcon}
            style={{width:110, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, textAlign:"center"}}/>
        </View>
        <View style={{flexDirection:"row", marginTop:8}}>
          <TextInput placeholder="Cor (#RRGGBB)" placeholderTextColor="#7d8fb0" value={color} onChangeText={setColor}
            style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}/>
          <Btn title="Adicionar" onPress={()=>{
            onCreate({name,target,icon,color});
            setName(""); setTarget("60"); setIcon("✅"); setColor("#5B8CFF");
          }} />
        </View>
      </Card>

      {[...habits].sort((a,b)=>a.order-b.order).map(h=>(
        <Card key={h.id} style={{marginBottom:10}}>
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center"}}>
            <View style={{flex:1, paddingRight:8}}>
              <Text style={{color:C.txt, fontWeight:"900"}}>{h.icon} {h.name}</Text>
              <Text style={{color:C.sub, marginTop:4}}>Meta semanal: {fmtHM(h.target||0)}</Text>
            </View>

            {editId === h.id ? (
              <View style={{flexDirection:"row", alignItems:"center"}}>
                <TextInput
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholder="min"
                  placeholderTextColor="#7d8fb0"
                  style={{width:110, backgroundColor:C.chip, color:C.txt, padding:10, borderRadius:10, borderWidth:1, borderColor:C.brd, marginRight:8}}
                />
                <Btn
                  title="Salvar"
                  kind="good"
                  onPress={()=>{
                    const x = parseInt(editTarget, 10);
                    if (isNaN(x)) { Alert.alert("Valor inválido","Digite um número."); return; }
                    onUpdate(h.id, { target: x });
                    setEditId(null);
                  }}
                />
                <View style={{width:8}} />
                <Btn title="Cancelar" kind="chip" onPress={()=>setEditId(null)} />
              </View>
            ) : (
              <View style={{flexDirection:"row"}}>
                <Btn title="Editar meta" kind="chip" onPress={()=>{ setEditId(h.id); setEditTarget(String(h.target||0)); }} />
                <View style={{width:12}} />
                <Btn title="Excluir" kind="danger" onPress={()=>onDelete(h.id)} />
              </View>
            )}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function GoalsScreen({ habits, goals, agg, prefs, onPrefsChange, onCreate, onDelete }){
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("120");
  const [selectedHabit, setSelectedHabit] = useState("total");
  const [notifyHourField, setNotifyHourField] = useState(String(prefs.notifyHour));

  useEffect(()=>{
    setNotifyHourField(String(prefs.notifyHour));
  }, [prefs.notifyHour]);

  useEffect(()=>{
    if (selectedHabit !== "total" && !habits.find(h=>h.id===selectedHabit)){
      setSelectedHabit("total");
    }
  }, [habits, selectedHabit]);

  const totalThisWeek = Object.values(agg.byHabit).reduce((a,b)=>a+b,0);

  const commitGoal = ()=>{
    onCreate({ title, target, habitId:selectedHabit });
    setTitle("");
    setTarget("120");
  };

  return (
    <ScrollView>
      <Card style={{marginBottom:12}}>
        <Text style={{color:C.sub, marginBottom:8}}>Nova meta semanal</Text>
        <TextInput
          placeholder="Nome da meta"
          placeholderTextColor="#7d8fb0"
          value={title}
          onChangeText={setTitle}
          style={{backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginBottom:8}}
        />
        <View style={{flexDirection:"row"}}>
          <TextInput
            placeholder="Minutos"
            placeholderTextColor="#7d8fb0"
            value={target}
            onChangeText={setTarget}
            keyboardType="numeric"
            style={{flex:1, backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd, marginRight:8}}
          />
        </View>

        <Text style={{color:C.sub, marginTop:10, marginBottom:6}}>Aplicar a</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:"row"}}>
            {[{id:"total", name:"Todas"}, ...habits].map(h=>(
              <View key={h.id} style={{marginRight:8}}>
                <Tag label={h.id==="total"?"Todas":`${h.icon||""} ${h.name}`} active={selectedHabit===h.id} onPress={()=>setSelectedHabit(h.id)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <Btn title="Criar meta" onPress={commitGoal} style={{marginTop:12}} />
      </Card>

      <Card style={{marginBottom:12}}>
        <Text style={{color:C.sub, marginBottom:8}}>Notificações</Text>
        <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <Text style={{color:C.txt, fontWeight:"700"}}>Lembrar diariamente</Text>
          <Switch
            value={prefs.notificationsEnabled}
            onValueChange={(v)=>onPrefsChange({...prefs, notificationsEnabled:v})}
            thumbColor={prefs.notificationsEnabled?C.acc:"#f4f3f4"}
            trackColor={{false:"#3b4763", true:"#233d6b"}}
          />
        </View>
        <Text style={{color:C.sub, marginBottom:6}}>Horário (0-23h)</Text>
        <TextInput
          placeholder="Hora"
          placeholderTextColor="#7d8fb0"
          keyboardType="numeric"
          value={notifyHourField}
          onChangeText={setNotifyHourField}
          onEndEditing={()=>{
            const n = clamp(parseInt(notifyHourField||"0",10),0,23);
            setNotifyHourField(String(n));
            onPrefsChange({...prefs, notifyHour:n});
          }}
          style={{backgroundColor:C.chip, color:C.txt, padding:12, borderRadius:12, borderWidth:1, borderColor:C.brd}}
        />
        {Platform.OS === "ios" || Platform.OS === "android" ? (
          <Text style={{color:C.sub, fontSize:12, marginTop:8}}>As notificações são agendadas localmente neste horário.</Text>
        ) : (
          <Text style={{color:C.warn, fontSize:12, marginTop:8}}>Notificações podem não estar disponíveis nesta plataforma.</Text>
        )}
      </Card>

      <Card>
        <Text style={{color:C.sub, marginBottom:8}}>Metas atuais</Text>
        {goals.length === 0 ? (
          <Text style={{color:C.sub}}>Nenhuma meta criada até o momento.</Text>
        ) : (
          goals.map(goal=>{
            const refHabit = goal.habitId === "total" ? null : habits.find(h=>h.id===goal.habitId);
            const progress = goal.habitId === "total" ? totalThisWeek : Math.max(0, agg.byHabit[goal.habitId]||0);
            const pct = Math.min(100, Math.round(100 * progress/Math.max(1, goal.target)));
            const remaining = Math.max(0, goal.target - progress);
            const color = refHabit?.color || C.acc;
            return (
              <View key={goal.id} style={{marginBottom:12, borderBottomWidth:1, borderBottomColor:C.brd, paddingBottom:12}}>
                <View style={{flexDirection:"row", justifyContent:"space-between", marginBottom:6}}>
                  <View style={{flex:1, paddingRight:8}}>
                    <Text style={{color:C.txt, fontWeight:"900"}}>{goal.title}</Text>
                    <Text style={{color:C.sub, fontSize:12}}>
                      {goal.habitId === "total" ? "Todas as atividades" : refHabit ? `${refHabit.icon} ${refHabit.name}` : "Atividade removida"}
                    </Text>
                  </View>
                  <Pressable onPress={()=>onDelete(goal.id)}>
                    <Text style={{color:C.bad, fontWeight:"700"}}>Excluir</Text>
                  </Pressable>
                </View>
                <Bar value={progress} total={goal.target} color={color} />
                <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:6}}>
                  <Text style={{color:C.sub, fontSize:12}}>Progresso: {fmtHM(progress)} / {fmtHM(goal.target)}</Text>
                  <Text style={{color:C.sub, fontSize:12}}>{pct}%</Text>
                </View>
                <Text style={{color:C.sub, fontSize:12, marginTop:4}}>Faltam {fmtHM(remaining)}</Text>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

function ReportsScreen({ habits, sessions, cursor, setCursor, prefs, setPrefs }){
  const start = useMemo(()=>{ const d=weekStart(); d.setDate(d.getDate()-cursor*7); return d; }, [cursor]);
  const { byHabit, dailyTotal } = useMemo(()=>aggregateWeek(sessions, habits, start), [sessions, habits, start]);
  const rows = habits.map(h=>({name:h.name, mins: Math.max(0, byHabit[h.id]||0), target: h.target||0, color:h.color}));
  const history = useMemo(()=>buildHistory(sessions, habits, 12), [sessions, habits]);
  const [compareHabit, setCompareHabit] = useState("total");
  const [weekA, setWeekA] = useState(Math.max(history.length-1, 0));
  const [weekB, setWeekB] = useState(Math.max(history.length-2, 0));

  useEffect(()=>{
    if (compareHabit !== "total" && !habits.find(h=>h.id===compareHabit)){
      setCompareHabit("total");
    }
  }, [habits, compareHabit]);

  useEffect(()=>{
    if (!history[weekA]) setWeekA(Math.max(history.length-1, 0));
    if (!history[weekB]) setWeekB(Math.max(history.length-2, 0));
  }, [history, weekA, weekB]);

  const detailWeekA = useMemo(()=> history[weekA] ? aggregateWeek(sessions, habits, history[weekA].start) : null, [history, weekA, sessions, habits]);
  const detailWeekB = useMemo(()=> history[weekB] ? aggregateWeek(sessions, habits, history[weekB].start) : null, [history, weekB, sessions, habits]);

  const baseSeries = new Array(7).fill(0);
  const seriesA = compareHabit === "total"
    ? (detailWeekA?.dailyTotal || baseSeries)
    : (detailWeekA?.dailyByHabit.map(day=>Math.max(0, day[compareHabit]||0)) || baseSeries);
  const seriesB = compareHabit === "total"
    ? (detailWeekB?.dailyTotal || baseSeries)
    : (detailWeekB?.dailyByHabit.map(day=>Math.max(0, day[compareHabit]||0)) || baseSeries);

  const habitInfo = compareHabit === "total" ? null : habits.find(h=>h.id===compareHabit);
  const primaryColor = habitInfo?.color || C.acc;
  const secondaryColor = hexToRgba(primaryColor, 0.35);
  const totalPrimary = compareHabit === "total" ? (history[weekA]?.total||0) : (history[weekA]?.byHabit.find(h=>h.id===compareHabit)?.mins||0);
  const totalSecondary = compareHabit === "total" ? (history[weekB]?.total||0) : (history[weekB]?.byHabit.find(h=>h.id===compareHabit)?.mins||0);

  const overallStreak = useMemo(()=>{
    let count = 0; let cur = weekStart();
    while(true){
      const ag = aggregateWeek(sessions, habits, cur);
      const target = habits.reduce((a,h)=>a+(h.target||0),0);
      const done = Object.values(ag.byHabit).reduce((a,b)=>a+b,0);
      if (target>0 && done>=target) { count++; cur = addDays(cur, -7); if (count>52) break; }
      else break;
    }
    return count;
  }, [sessions, habits]);

  const totalWeek = rows.reduce((a,r)=>a+r.mins,0);
  const avgPerDay = Math.round(totalWeek/7);

  // melhor dia desta semana
  const bestIdx = dailyTotal.indexOf(Math.max(...dailyTotal));
  const bestDay = bestIdx>=0 ? shortDow[bestIdx] : "-";

  const jsonBackup = JSON.stringify({ habits, sessions }, null, 2);
  const csv = buildCSV(habits, sessions);

  const shareText = async (text, filename) => {
    try { await Share.share({ message: text, title: filename }); } catch {}
  };

  return (
    <ScrollView>
      <View style={{flexDirection:"row", marginBottom:10}}>
        <Btn title="< Semana" kind="chip" onPress={()=>setCursor(cursor+1)} />
        <View style={{width:8}} />
        <Btn title="Semana >" kind="chip" onPress={()=>setCursor(Math.max(0,cursor-1))} />
        <View style={{width:8}} />
        <Btn title={prefs.showBackup? "Ocultar backup":"Mostrar backup"} kind="chip" onPress={()=>setPrefs({...prefs, showBackup: !prefs.showBackup})} />
      </View>

      <Card style={{marginBottom:12}}>
        <Text style={{color:C.sub, marginBottom:8}}>Semana {fmtDate(start)} a {fmtDate(addDays(start,6))}</Text>

        {/* KPIs da semana selecionada */}
        <View style={{flexDirection:"row", justifyContent:"space-between", marginBottom:10}}>
          <Stat label="Total" value={fmtHM(totalWeek)} />
          <Stat label="Média/dia" value={fmtHM(avgPerDay)} />
          <Stat label="Melhor dia" value={bestDay} />
          <Stat label="Streak 100%" value={String(overallStreak)} />
        </View>

        {rows.map((r,i)=>(
          <View key={i} style={{marginBottom:10}}>
            <View style={{flexDirection:"row", justifyContent:"space-between"}}>
              <Text style={{color:C.txt, fontWeight:"900"}}>{r.name}</Text>
              <Text style={{color:C.sub}}>{fmtHM(r.mins)} / {fmtHM(r.target)}</Text>
            </View>
            <Bar value={r.mins} total={r.target} color={r.color}/>
          </View>
        ))}
      </Card>

      <Card style={{marginBottom:12}}>
        <Text style={{color:C.sub, marginBottom:8}}>Comparar semanas por atividade</Text>

        <Text style={{color:C.sub, marginBottom:6}}>Selecione a atividade</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:"row"}}>
            {[{id:"total", name:"Todas"}, ...habits].map(h=>(
              <View key={h.id} style={{marginRight:8}}>
                <Tag label={h.id==="total"?"Todas":`${h.icon||""} ${h.name}`} active={compareHabit===h.id} onPress={()=>setCompareHabit(h.id)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={{color:C.sub, marginTop:12, marginBottom:6}}>Semana principal</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:"row"}}>
            {history.map((w,i)=>(
              <View key={`primary-${i}`} style={{marginRight:8}}>
                <Tag label={`${monthDay(w.start)}`} active={weekA===i} onPress={()=>setWeekA(i)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={{color:C.sub, marginTop:12, marginBottom:6}}>Semana sobreposta</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:8}}>
          <View style={{flexDirection:"row"}}>
            {history.map((w,i)=>(
              <View key={`secondary-${i}`} style={{marginRight:8}}>
                <Tag label={`${monthDay(w.start)}`} active={weekB===i} onPress={()=>setWeekB(i)} />
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{marginTop:12}}>
          <CompareChart seriesA={seriesA} seriesB={seriesB} colorA={primaryColor} colorB={secondaryColor} />
        </View>

        <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:10}}>
          <View style={{flexDirection:"row", alignItems:"center"}}>
            <View style={{width:12, height:12, borderRadius:6, backgroundColor:primaryColor, marginRight:6}} />
            <Text style={{color:C.sub, fontSize:12}}>Semana {history[weekA] ? fmtDate(history[weekA].start) : "-"}</Text>
          </View>
          <View style={{flexDirection:"row", alignItems:"center"}}>
            <View style={{width:12, height:12, borderRadius:6, backgroundColor:secondaryColor, marginRight:6}} />
            <Text style={{color:C.sub, fontSize:12}}>Semana {history[weekB] ? fmtDate(history[weekB].start) : "-"}</Text>
          </View>
        </View>

        <Text style={{color:C.sub, marginTop:8, fontSize:12}}>
          Total selecionado: {fmtHM(totalPrimary)} vs {fmtHM(totalSecondary)} ({totalPrimary>totalSecondary?"↑":totalPrimary<totalSecondary?"↓":"="})
        </Text>
      </Card>

      {/* Exportações */}
      <Card style={{marginBottom:12}}>
        <Text style={{color:C.sub, marginBottom:8}}>Exportar</Text>
        <View style={{flexDirection:"row"}}>
          <Btn title="CSV" kind="chip" onPress={()=>shareText(csv, "cronograma.csv")} />
          <View style={{width:8}} />
          <Btn title="JSON" kind="chip" onPress={()=>shareText(jsonBackup, "cronograma.json")} />
        </View>
      </Card>

      {prefs.showBackup ? (
        <Card>
          <Text style={{color:C.sub, marginBottom:8}}>Backup (copie e guarde):</Text>
          <View style={{backgroundColor:"#0d1526", borderColor:C.brd, borderWidth:1, borderRadius:12, padding:10}}>
            <Text selectable style={{color:"#cdd9f1", fontSize:12}}>{jsonBackup}</Text>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

/* ---------------------- micro-gráficos ---------------------- */
function MiniBars({ series, color, max }){
  const n = series.length;
  return (
    <View style={{flexDirection:"row", alignItems:"flex-end", height:52, justifyContent:"space-between"}}>
      {series.map((v,i)=>{
        const h = Math.round((v/Math.max(1,max))*48);
        return <View key={i} style={{height:48, justifyContent:"flex-end", width:`${100/n}%`, alignItems:"center"}}>
          <View style={{height:h, width:10, backgroundColor:color, borderRadius:5}}/>
        </View>;
      })}
    </View>
  );
}

function HeatmapWeek({ totals }){
  const max = Math.max(...totals, 1);
  return (
    <View style={{flexDirection:"row", justifyContent:"space-between"}}>
      {totals.map((v,i)=>{
        const op = Math.max(0.15, v/max); // intensidade
        return (
          <View key={i} style={{alignItems:"center", width:`${100/7}%`}}>
            <View style={{width:26, height:26, borderRadius:6, backgroundColor:`rgba(91,140,255,${op})`, borderWidth:1, borderColor:C.brd}} />
            <Text style={{color:C.sub, fontSize:12, marginTop:6}}>{shortDow[i]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CompareChart({ seriesA, seriesB, colorA, colorB }){
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
  return (
    <View style={{paddingHorizontal:24, paddingTop:12, paddingBottom:24, backgroundColor:"#0c1423", borderTopWidth:1, borderTopColor:"#121c30"}}>
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
                backgroundColor: active ? hexToRgba(C.acc,0.22) : pressed ? "#0f1a2c" : "transparent",
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
function hexToRgba(hex, alpha){
  if (!hex) return `rgba(91,140,255,${alpha})`;
  const clean = hex.replace("#","");
  if (clean.length !==6) return `rgba(91,140,255,${alpha})`;
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
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
