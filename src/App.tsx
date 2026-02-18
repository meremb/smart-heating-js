import React, { useMemo, useState } from 'react'
import Plot from './ui/Plot'
import { MODE_EXISTING, MODE_FIXED, MODE_PUMP, MODE_BAL, INSULATION_U_VALUES, GLAZING_U_VALUES, ROOM_TYPE_OPTIONS, PUMP_LIBRARY } from './config'
import { defaultRoomTable, computeRoomResults, splitHeatLossToRadiators } from './services/roomService'
import { initRadiatorRows, resizeRadiatorRows, initCollectorRows, resizeCollectorRows } from './services/radiatorService'
import { getValveNames } from './domain/valve'
import { computeAll } from './services/compute'

type Tab = 'tab0'|'tab1'|'tab2'|'tab3'

export default function App(){
  const [tab, setTab] = useState<Tab>('tab0')
  const [designMode, setDesignMode] = useState<string>(MODE_EXISTING)
  const [heatLoadMode, setHeatLoadMode] = useState<'known'|'unknown'|''>('')

  const [wallState, setWallState] = useState('bit insulated')
  const [roofState, setRoofState] = useState('bit insulated')
  const [groundState, setGroundState] = useState('bit insulated')
  const [glazingType, setGlazingType] = useState('double')
  const [uw, setUw] = useState(1.0)
  const [uRoof, setURoof] = useState(0.2)
  const [uGround, setUGround] = useState(0.3)
  const [uGlass, setUGlass] = useState(2.8)
  const [tout, setTout] = useState(-7.0)
  const [ventMethod, setVentMethod] = useState<'simple'|'NBN-D-50-001'>('simple')
  const [vSystem, setVSystem] = useState<'C'|'D'>('C')
  const [v50, setV50] = useState(6.0)
  const [neighbourT, setNeighbourT] = useState(18.0)
  const [un, setUn] = useState(1.0)
  const [lir, setLir] = useState(0.2)
  const [wallHeight, setWallHeight] = useState(2.7)

  const [numRooms, setNumRooms] = useState(3)
  const [roomRows, setRoomRows] = useState<any[]>(defaultRoomTable(3))
  const [manualLossRows, setManualLossRows] = useState<any[]>(Array.from({length:3}, (_,i)=>({'Room #':i+1, 'Manual Heat Loss (W)':0.0})))

  const [numRadiators, setNumRadiators] = useState(3)
  const [numCollectors, setNumCollectors] = useState(1)
  const [deltaT, setDeltaT] = useState(10)
  const [supplyTempInput, setSupplyTempInput] = useState<number|''>('')
  const [fixDiameter, setFixDiameter] = useState(false)
  const [pumpModel, setPumpModel] = useState(Object.keys(PUMP_LIBRARY)[0])
  const [pumpSpeed, setPumpSpeed] = useState('speed_2')
  const [valveType, setValveType] = useState('Custom')
  const [positions, setPositions] = useState(8)
  const [kvMax, setKvMax] = useState(0.7)

  const [radiatorRows, setRadiatorRows] = useState<any[]>(initRadiatorRows(3, ['Collector 1'], [1,2,3]))
  const [collectorRows, setCollectorRows] = useState<any[]>(initCollectorRows(1))
  const [valveOverrides, setValveOverrides] = useState<any[]>([])

  const applyPresets = (nextWall: string, nextRoof: string, nextGround: string, nextGlazing: string) => {
    const iw = INSULATION_U_VALUES[nextWall]
    const ir = INSULATION_U_VALUES[nextRoof]
    const ig = INSULATION_U_VALUES[nextGround]
    if (iw) setUw(iw.wall)
    if (ir) setURoof(ir.roof)
    if (ig) setUGround(ig.ground)
    const g = GLAZING_U_VALUES[nextGlazing]
    if (g !== undefined) setUGlass(g)
  }

  const collectorOptions = useMemo(()=> Array.from({length:numCollectors}, (_,i)=>`Collector ${i+1}`), [numCollectors])

  const resizeRooms = (n:number) => {
    const nn = Math.max(1, Math.floor(n))
    setNumRooms(nn)
    setRoomRows(prev => {
      const rows = prev.slice(0, nn)
      while (rows.length < nn){
        rows.push({'Room #': rows.length+1, 'Indoor Temp (°C)':20.0,'Floor Area (m²)':10.0,'Walls external':2,'Room Type':'Living','On Ground':false,'Under Roof':false})
      }
      rows.forEach((r,i)=>r['Room #']=i+1)
      return rows
    })
    setManualLossRows(prev => {
      const rows = prev.slice(0, nn)
      while (rows.length < nn){ rows.push({'Room #': rows.length+1, 'Manual Heat Loss (W)':0.0}) }
      rows.forEach((r,i)=>r['Room #']=i+1)
      return rows
    })
  }

  const resizeTab2 = (nr:number, nc:number) => {
    const nrr = Math.max(1, Math.floor(nr))
    const ncc = Math.max(1, Math.floor(nc))
    setNumRadiators(nrr); setNumCollectors(ncc)
    const colOpts = Array.from({length:ncc}, (_,i)=>`Collector ${i+1}`)
    setRadiatorRows(prev => resizeRadiatorRows(prev, nrr, colOpts, roomRows.map(r=>r['Room #'])))
    setCollectorRows(prev => resizeCollectorRows(prev, ncc))
  }

  const roomResults = useMemo(() => {
    if (heatLoadMode === 'known'){
      return manualLossRows.map(r => ({ Room: Number(r['Room #']), 'Total Heat Loss (W)': Number(r['Manual Heat Loss (W)']||0) }))
    }
    if (heatLoadMode === 'unknown'){
      return computeRoomResults(roomRows, uw, uRoof, uGround, uGlass, tout, 'fromFloorArea', ventMethod, vSystem, v50, neighbourT, un, lir, wallHeight, false, true)
    }
    return []
  }, [heatLoadMode, manualLossRows, roomRows, uw, uRoof, uGround, uGlass, tout, ventMethod, vSystem, v50, neighbourT, un, lir, wallHeight])

  const heatLossSplit = useMemo(() => splitHeatLossToRadiators(radiatorRows, roomResults), [radiatorRows, roomResults])

  const computed = useMemo(() => {
    const cfg = {
      design_mode: designMode,
      delta_T: deltaT,
      supply_temp_input: (designMode===MODE_FIXED ? (supplyTempInput===''? null : Number(supplyTempInput)) : null),
      fix_diameter: fixDiameter,
      pump_model: pumpModel,
      pump_speed: pumpSpeed,
      valve_type: valveType,
      positions,
      kv_max: kvMax,
    }
    return computeAll(radiatorRows, collectorRows, heatLossSplit, cfg as any, roomRows, valveOverrides)
  }, [radiatorRows, collectorRows, heatLossSplit, designMode, deltaT, supplyTempInput, fixDiameter, pumpModel, pumpSpeed, valveType, positions, kvMax, roomRows, valveOverrides])

  const valveNames = useMemo(()=>getValveNames(), [])

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Smart Heating Design Tool — Static JS (GitHub Pages)</div>
        <small>Client-side port of the Dash tool (4 tabs).</small>

        <div className="tabs">
          <button className={"tab "+(tab==='tab0'?'active':'')} onClick={()=>setTab('tab0')}>0️⃣ Start</button>
          <button className={"tab "+(tab==='tab1'?'active':'')} onClick={()=>setTab('tab1')}>1️⃣ Heat Loss</button>
          <button className={"tab "+(tab==='tab2'?'active':'')} onClick={()=>setTab('tab2')}>2️⃣ Radiators</button>
          <button className={"tab "+(tab==='tab3'?'active':'')} onClick={()=>setTab('tab3')}>3️⃣ Results</button>
        </div>

        {tab==='tab0' && (
          <div className="row">
            <div className="col card">
              <div className="h1">Design mode</div>
              <select value={designMode} onChange={e=>setDesignMode(e.target.value)}>
                <option value={MODE_EXISTING}>Existing</option>
                <option value={MODE_FIXED}>Fixed supply</option>
                <option value={MODE_PUMP}>Pump-based</option>
                <option value={MODE_BAL}>Balancing</option>
              </select>
            </div>
            <div className="col card">
              <div className="h1">Heat loss mode</div>
              <label><input type="radio" name="hl" checked={heatLoadMode==='known'} onChange={()=>{setHeatLoadMode('known'); setTab('tab1')}} /> Known (manual)</label>
              <label><input type="radio" name="hl" checked={heatLoadMode==='unknown'} onChange={()=>{setHeatLoadMode('unknown'); setTab('tab1')}} /> Unknown (calculate)</label>
            </div>
          </div>
        )}

        {tab==='tab1' && (
          <div className="row">
            <div className="col card">
              <div className="h1">Envelope</div>
              <label>Wall preset</label>
              <select value={wallState} onChange={e=>{setWallState(e.target.value); applyPresets(e.target.value, roofState, groundState, glazingType)}}>
                {Object.keys(INSULATION_U_VALUES).map(k=><option key={k} value={k}>{k}</option>)}
              </select>
              <label>Roof preset</label>
              <select value={roofState} onChange={e=>{setRoofState(e.target.value); applyPresets(wallState, e.target.value, groundState, glazingType)}}>
                {Object.keys(INSULATION_U_VALUES).map(k=><option key={k} value={k}>{k}</option>)}
              </select>
              <label>Ground preset</label>
              <select value={groundState} onChange={e=>{setGroundState(e.target.value); applyPresets(wallState, roofState, e.target.value, glazingType)}}>
                {Object.keys(INSULATION_U_VALUES).map(k=><option key={k} value={k}>{k}</option>)}
              </select>
              <label>Glazing</label>
              <select value={glazingType} onChange={e=>{setGlazingType(e.target.value); applyPresets(wallState, roofState, groundState, e.target.value)}}>
                {Object.keys(GLAZING_U_VALUES).map(k=><option key={k} value={k}>{k}</option>)}
              </select>

              <div className="row">
                <div className="col">
                  <label>Uw</label><input type="number" value={uw} step={0.05} onChange={e=>setUw(Number(e.target.value))}/>
                  <label>U roof</label><input type="number" value={uRoof} step={0.05} onChange={e=>setURoof(Number(e.target.value))}/>
                </div>
                <div className="col">
                  <label>U ground</label><input type="number" value={uGround} step={0.05} onChange={e=>setUGround(Number(e.target.value))}/>
                  <label>U glass</label><input type="number" value={uGlass} step={0.05} onChange={e=>setUGlass(Number(e.target.value))}/>
                </div>
              </div>

              <label>Tout (°C)</label><input type="number" value={tout} step={0.5} onChange={e=>setTout(Number(e.target.value))}/>
              <label>Ventilation method</label>
              <select value={ventMethod} onChange={e=>setVentMethod(e.target.value as any)}>
                <option value="simple">simple</option>
                <option value="NBN-D-50-001">NBN-D-50-001</option>
              </select>
              <label>Ventilation system</label>
              <select value={vSystem} onChange={e=>setVSystem(e.target.value as any)}>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
              <label>v50</label><input type="number" value={v50} step={0.5} onChange={e=>setV50(Number(e.target.value))}/>
              <label>Neighbour T</label><input type="number" value={neighbourT} step={0.5} onChange={e=>setNeighbourT(Number(e.target.value))}/>
              <label>Un</label><input type="number" value={un} step={0.1} onChange={e=>setUn(Number(e.target.value))}/>
              <label>LIR</label><input type="number" value={lir} step={0.05} onChange={e=>setLir(Number(e.target.value))}/>
              <label>Wall height</label><input type="number" value={wallHeight} step={0.1} onChange={e=>setWallHeight(Number(e.target.value))}/>
            </div>

            <div className="col card">
              <div className="h1">Rooms</div>
              <label>Number of rooms</label>
              <input type="number" value={numRooms} min={1} step={1} onChange={e=>resizeRooms(Number(e.target.value))}/>

              {heatLoadMode==='known' ? (
                <table>
                  <thead><tr><th>Room #</th><th>Manual Heat Loss (W)</th></tr></thead>
                  <tbody>
                    {manualLossRows.map((r, idx)=>(
                      <tr key={idx}>
                        <td>{r['Room #']}</td>
                        <td><input type="number" value={r['Manual Heat Loss (W)']} onChange={e=>{
                          const v = Number(e.target.value)
                          setManualLossRows(prev=>prev.map((x,i)=>i===idx?{...x,'Manual Heat Loss (W)':v}:x))
                        }}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead><tr><th>#</th><th>Tin</th><th>Area</th><th>Walls</th><th>Type</th><th>Ground</th><th>Roof</th></tr></thead>
                  <tbody>
                    {roomRows.map((r, idx)=>(
                      <tr key={idx}>
                        <td>{r['Room #']}</td>
                        <td><input type="number" value={r['Indoor Temp (°C)']} onChange={e=>setRoomRows(prev=>prev.map((x,i)=>i===idx?{...x,'Indoor Temp (°C)':Number(e.target.value)}:x))}/></td>
                        <td><input type="number" value={r['Floor Area (m²)']} onChange={e=>setRoomRows(prev=>prev.map((x,i)=>i===idx?{...x,'Floor Area (m²)':Number(e.target.value)}:x))}/></td>
                        <td><select value={r['Walls external']} onChange={e=>setRoomRows(prev=>prev.map((x,i)=>i===idx?{...x,'Walls external':Number(e.target.value)}:x))}>{[1,2,3,4].map(v=><option key={v} value={v}>{v}</option>)}</select></td>
                        <td><select value={r['Room Type']} onChange={e=>setRoomRows(prev=>prev.map((x,i)=>i===idx?{...x,'Room Type':e.target.value}:x))}>{ROOM_TYPE_OPTIONS.map(v=><option key={v} value={v}>{v}</option>)}</select></td>
                        <td><input type="checkbox" checked={!!r['On Ground']} onChange={e=>setRoomRows(prev=>prev.map((x,i)=>i===idx?{...x,'On Ground':e.target.checked}:x))}/></td>
                        <td><input type="checkbox" checked={!!r['Under Roof']} onChange={e=>setRoomRows(prev=>prev.map((x,i)=>i===idx?{...x,'Under Roof':e.target.checked}:x))}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="h1" style={{marginTop:10}}>Room results</div>
              <table>
                <thead><tr><th>Room</th><th>Total Heat Loss (W)</th></tr></thead>
                <tbody>
                  {roomResults.map((r, i)=>(<tr key={i}><td>{r.Room}</td><td>{Number(r['Total Heat Loss (W)']).toFixed(0)}</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='tab2' && (
          <div className="row">
            <div className="col card">
              <div className="h1">System</div>
              <label>Radiators</label><input type="number" value={numRadiators} min={1} onChange={e=>resizeTab2(Number(e.target.value), numCollectors)} />
              <label>Collectors</label><input type="number" value={numCollectors} min={1} onChange={e=>resizeTab2(numRadiators, Number(e.target.value))} />
              <label>ΔT</label><input type="number" value={deltaT} min={3} max={20} onChange={e=>setDeltaT(Number(e.target.value))}/>
              {designMode===MODE_FIXED && (<><label>Supply temperature</label><input type="number" value={supplyTempInput} onChange={e=>setSupplyTempInput(e.target.value===''? '' : Number(e.target.value))}/></>)}
              <label><input type="checkbox" checked={fixDiameter} onChange={e=>setFixDiameter(e.target.checked)} /> Fix diameter per radiator</label>

              {designMode===MODE_PUMP && (
                <>
                  <div className="h1" style={{marginTop:10}}>Pump</div>
                  <label>Model</label>
                  <select value={pumpModel} onChange={e=>setPumpModel(e.target.value)}>{Object.keys(PUMP_LIBRARY).map(p=><option key={p} value={p}>{p}</option>)}</select>
                  <label>Speed</label>
                  <select value={pumpSpeed} onChange={e=>setPumpSpeed(e.target.value)}>{['speed_1','speed_2','speed_3'].map(s=><option key={s} value={s}>{s}</option>)}</select>
                </>
              )}

              <div className="h1" style={{marginTop:10}}>Valve</div>
              <select value={valveType} onChange={e=>setValveType(e.target.value)}>{valveNames.map(v=><option key={v} value={v}>{v}</option>)}</select>
              <label>Positions</label><input type="number" value={positions} min={2} onChange={e=>setPositions(Number(e.target.value))}/>
              <label>Kv max</label><input type="number" value={kvMax} step={0.1} onChange={e=>setKvMax(Number(e.target.value))}/>
            </div>

            <div className="col card">
              <div className="h1">Radiators</div>
              <table>
                <thead><tr><th>#</th><th>Room</th><th>Collector</th><th>Power</th><th>Length</th><th>Elec</th>{fixDiameter && <th>Dia</th>}</tr></thead>
                <tbody>
                  {radiatorRows.map((r, idx)=>(
                    <tr key={idx}>
                      <td>{r['Radiator nr']}</td>
                      <td><select value={r['Room']} onChange={e=>setRadiatorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Room':Number(e.target.value)}:x))}>{roomRows.map(rr=><option key={rr['Room #']} value={rr['Room #']}>{rr['Room #']}</option>)}</select></td>
                      <td><select value={r['Collector']} onChange={e=>setRadiatorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Collector':e.target.value}:x))}>{collectorOptions.map(c=><option key={c} value={c}>{c}</option>)}</select></td>
                      <td><input type="number" value={r['Radiator power 75/65/20']} onChange={e=>setRadiatorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Radiator power 75/65/20':Number(e.target.value)}:x))}/></td>
                      <td><input type="number" value={r['Length circuit']} onChange={e=>setRadiatorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Length circuit':Number(e.target.value)}:x))}/></td>
                      <td><input type="number" value={r['Electric power']} onChange={e=>setRadiatorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Electric power':Number(e.target.value)}:x))}/></td>
                      {fixDiameter && <td><input type="number" value={r['Fixed Diameter (mm)'] ?? 16} onChange={e=>setRadiatorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Fixed Diameter (mm)':Number(e.target.value)}:x))}/></td>}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="h1" style={{marginTop:10}}>Collectors</div>
              <table>
                <thead><tr><th>Collector</th><th>Length</th></tr></thead>
                <tbody>
                  {collectorRows.map((c, idx)=>(
                    <tr key={idx}>
                      <td>{c['Collector']}</td>
                      <td><input type="number" value={c['Collector circuit length']} onChange={e=>setCollectorRows(prev=>prev.map((x,i)=>i===idx?{...x,'Collector circuit length':Number(e.target.value)}:x))}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='tab3' && (
          <div>
            {computed.warnings.length>0 && (<div className="card"><div className="h1">Warnings</div>{computed.warnings.map((w:any,i:number)=><div key={i} className="warn">• {w}</div>)}</div>)}
            <div className="row" style={{marginTop:12}}>
              <div className="col card"><div className="h1">Total Heat Loss</div><div>{computed.metrics.totalHeatLoss_W.toFixed(0)} W</div></div>
              <div className="col card"><div className="h1">Total Radiator Power</div><div>{computed.metrics.totalPower_W.toFixed(0)} W</div></div>
              <div className="col card"><div className="h1">Total Flow</div><div>{computed.metrics.totalFlow_kg_h.toFixed(1)} kg/h</div></div>
              <div className="col card"><div className="h1">Weighted ΔT</div><div>{computed.metrics.weightedDeltaT_C.toFixed(2)} °C</div></div>
              <div className="col card"><div className="h1">Highest Supply</div><div>{computed.metrics.highestSupply}</div></div>
            </div>
            <div className="row" style={{marginTop:12}}>
              <div className="col card"><Plot data={computed.charts.power.data} layout={computed.charts.power.layout} style={{height:460}}/></div>
              <div className="col card"><Plot data={computed.charts.temp.data} layout={computed.charts.temp.layout} style={{height:460}}/></div>
            </div>
            <div className="row" style={{marginTop:12}}>
              <div className="col card"><Plot data={computed.charts.pressure.data} layout={computed.charts.pressure.layout} style={{height:460}}/></div>
              <div className="col card"><Plot data={computed.charts.mass.data} layout={computed.charts.mass.layout} style={{height:460}}/></div>
            </div>
            <div className="row" style={{marginTop:12}}>
              <div className="col card"><Plot data={computed.charts.pump.data} layout={computed.charts.pump.layout} style={{height:460}}/></div>
            </div>
            <div className="row" style={{marginTop:12}}>
              <div className="col card"><Plot data={computed.charts.valve.data} layout={computed.charts.valve.layout} style={{height:460}}/></div>
            </div>

            {designMode===MODE_BAL && (
              <div className="card" style={{marginTop:12}}>
                <div className="h1">Valve Overrides</div>
                <small>Set overrides (Radiator nr → Valve Position Override).</small>
                <table>
                  <thead><tr><th>Radiator nr</th><th>Override</th></tr></thead>
                  <tbody>
                    {computed.merged.map((r:any, idx:number)=>(
                      <tr key={idx}>
                        <td>{r['Radiator nr']}</td>
                        <td><input type="number" value={(valveOverrides.find(v=>v['Radiator nr']===r['Radiator nr'])?.['Valve Position Override'] ?? '') as any}
                          onChange={e=>{
                            const v = e.target.value
                            setValveOverrides(prev => {
                              const copy = prev.slice()
                              const i = copy.findIndex(x=>x['Radiator nr']===r['Radiator nr'])
                              const row = { 'Radiator nr': r['Radiator nr'], 'Valve Position Override': v }
                              if (i>=0) copy[i]=row; else copy.push(row)
                              return copy
                            })
                          }}
                        /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
