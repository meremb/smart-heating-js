import React, { useMemo, useState } from 'react'
import { getValveNames } from './domain/valve'
import { CollectorRow, RadiatorRow, ValveOverrides } from './domain/types'
import { recomputeAll } from './services/engine'
import Plot from './ui/Plot'

type Tab = 'start'|'heat'|'radiators'|'results'

const initialRadiators: RadiatorRow[] = [
  {
    radiatorNr: 1,
    roomId: 1,
    collector: 'Collector 1',
    radiatorPower_75_65_20_W: 2000,
    calculatedHeatLoss_W: 800,
    lengthCircuit_m: 10,
    spaceTemp_C: 20,
    deltaT_K: 10,
    supplyTemp_C: 55,
    returnTemp_C: 45,
    massFlowRate_kg_h: 0,
    diameter_mm: 16,
    valveName: 'Danfoss RA-N 15 (1/2)'
  },
  {
    radiatorNr: 2,
    roomId: 2,
    collector: 'Collector 1',
    radiatorPower_75_65_20_W: 2500,
    calculatedHeatLoss_W: 1200,
    lengthCircuit_m: 15,
    spaceTemp_C: 22,
    deltaT_K: 10,
    supplyTemp_C: 55,
    returnTemp_C: 45,
    massFlowRate_kg_h: 0,
    diameter_mm: 16,
    valveName: 'Danfoss RA-N 15 (1/2)'
  }
]

const initialCollectors: CollectorRow[] = [
  { name: 'Collector 1', length_m: 12, massFlowRate_kg_h: 0, diameter_mm: 22 }
]

export default function App(){
  const [tab, setTab] = useState<Tab>('results')
  const [supplyTemp, setSupplyTemp] = useState(55)
  const [deltaT, setDeltaT] = useState(10)
  const [radiators, setRadiators] = useState<RadiatorRow[]>(initialRadiators)
  const [collectors, setCollectors] = useState<CollectorRow[]>(initialCollectors)
  const [overrides, setOverrides] = useState<ValveOverrides>({})

  const computed = useMemo(() => recomputeAll(radiators, collectors, overrides, supplyTemp, deltaT),
    [radiators, collectors, overrides, supplyTemp, deltaT]
  )

  const valveNames = useMemo(() => getValveNames(), [])

  function updateOverride(radiatorNr: number, patch: any){
    setOverrides(prev => ({ ...prev, [radiatorNr]: { ...(prev[radiatorNr] ?? {}), ...patch } }))
  }

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Smart Heating Design Tool — JS/TS Starter</div>
        <small>
          This is a starter rewrite of your Dash app structure in JavaScript/TypeScript.
          Replace the placeholder hydraulics/valve formulas with your validated Python domain logic.
        </small>

        <div className="tabs">
          <button className={"tab "+(tab==='start'?'active':'')} onClick={()=>setTab('start')}>Start</button>
          <button className={"tab "+(tab==='heat'?'active':'')} onClick={()=>setTab('heat')}>Heat Loss</button>
          <button className={"tab "+(tab==='radiators'?'active':'')} onClick={()=>setTab('radiators')}>Radiators & Collectors</button>
          <button className={"tab "+(tab==='results'?'active':'')} onClick={()=>setTab('results')}>Results</button>
        </div>

        {tab === 'start' && (
          <div className="row">
            <div className="col card">
              <div className="h1">Global settings</div>
              <label>Supply temperature (°C)</label>
              <input type="number" value={supplyTemp} onChange={e=>setSupplyTemp(Number(e.target.value))} />
              <label>Delta T across radiator (K)</label>
              <input type="number" value={deltaT} onChange={e=>setDeltaT(Number(e.target.value))} />
              <small>These drive mass flows (ṁ = Q / (cp·ΔT)).</small>
            </div>
            <div className="col card">
              <div className="h1">Warnings</div>
              {computed.warnings.length===0
                ? <span className="badge ok">No warnings</span>
                : computed.warnings.map((w,i)=>(<div key={i} className="warn">• {w}</div>))
              }
            </div>
          </div>
        )}

        {tab === 'heat' && (
          <div className="card">
            <div className="h1">Heat Loss (placeholder)</div>
            <p>
              In the Python app, heat loss comes from a dedicated calculator and room tables.
              This starter focuses on the hydraulics + valve override pipeline.
            </p>
          </div>
        )}

        {tab === 'radiators' && (
          <div className="row">
            <div className="col card">
              <div className="h1">Radiators (editable)</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Collector</th><th>Heat loss (W)</th><th>Length (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {radiators.map((r, idx) => (
                    <tr key={r.radiatorNr}>
                      <td>{r.radiatorNr}</td>
                      <td><input value={r.collector} onChange={e=>{
                        const v=e.target.value; setRadiators(prev=>prev.map(x=>x.radiatorNr===r.radiatorNr?{...x, collector:v}:x))
                      }}/></td>
                      <td><input type="number" value={r.calculatedHeatLoss_W} onChange={e=>{
                        const v=Number(e.target.value); setRadiators(prev=>prev.map(x=>x.radiatorNr===r.radiatorNr?{...x, calculatedHeatLoss_W:v}:x))
                      }}/></td>
                      <td><input type="number" value={r.lengthCircuit_m} onChange={e=>{
                        const v=Number(e.target.value); setRadiators(prev=>prev.map(x=>x.radiatorNr===r.radiatorNr?{...x, lengthCircuit_m:v}:x))
                      }}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="col card">
              <div className="h1">Collectors (editable)</div>
              <table>
                <thead><tr><th>Name</th><th>Length (m)</th></tr></thead>
                <tbody>
                  {collectors.map((c, idx) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td><input type="number" value={c.length_m} onChange={e=>{
                        const v=Number(e.target.value); setCollectors(prev=>prev.map(x=>x.name===c.name?{...x, length_m:v}:x))
                      }}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'results' && (
          <div className="row">
            <div className="col card">
              <div className="h1">Valve balancing overrides</div>
              <small>Edit position or Kv to override. Kv wins over position if provided.</small>
              <table>
                <thead>
                  <tr>
                    <th>Rad #</th><th>Valve</th><th>Position</th><th>Override Kv</th><th>Computed Kv</th><th>Δp valve (kPa)</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.radiators.map(r => (
                    <tr key={r.radiatorNr}>
                      <td>{r.radiatorNr}</td>
                      <td>
                        <select value={(overrides[r.radiatorNr]?.valveName ?? r.valveName)} onChange={e=>updateOverride(r.radiatorNr, { valveName: e.target.value })}>
                          {valveNames.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td><input type="number" value={(overrides[r.radiatorNr]?.position ?? r.valvePosition ?? '') as any} onChange={e=>updateOverride(r.radiatorNr, { position: e.target.value===''?undefined:Number(e.target.value) })} /></td>
                      <td><input type="number" value={(overrides[r.radiatorNr]?.kv ?? '') as any} onChange={e=>updateOverride(r.radiatorNr, { kv: e.target.value===''?undefined:Number(e.target.value) })} /></td>
                      <td>{(r.valveKv ?? 0).toFixed(3)}</td>
                      <td>{Number.isFinite(r.dpValve_Pa ?? 0) ? ((r.dpValve_Pa ?? 0)/1000).toFixed(2) : '∞'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="col card">
              <div className="h1">Hydraulics results</div>
              <table>
                <thead>
                  <tr>
                    <th>Rad #</th><th>ṁ (kg/h)</th><th>Diam (mm)</th><th>Δp total (kPa)</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.radiators.map(r => (
                    <tr key={r.radiatorNr}>
                      <td>{r.radiatorNr}</td>
                      <td>{(r.massFlowRate_kg_h ?? 0).toFixed(1)}</td>
                      <td>{(r.diameter_mm ?? 0).toFixed(0)}</td>
                      <td>{Number.isFinite(r.dpTotal_Pa ?? 0) ? ((r.dpTotal_Pa ?? 0)/1000).toFixed(2) : '∞'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 12 }}>
                <Plot
                  data={[{
                    x: computed.radiators.map(r=>r.radiatorNr),
                    y: computed.radiators.map(r=>Number.isFinite(r.dpTotal_Pa ?? 0)? ((r.dpTotal_Pa ?? 0)/1000): null),
                    type: 'bar'
                  }]}
                  layout={{ title: 'Total pressure loss by radiator (kPa)', xaxis: {title: 'Radiator'}, yaxis: {title: 'Δp (kPa)'} }}
                />
              </div>

              <div className="h1" style={{ marginTop: 12 }}>Collectors</div>
              <table>
                <thead><tr><th>Name</th><th>ṁ (kg/h)</th><th>Diam (mm)</th><th>Δp (kPa)</th></tr></thead>
                <tbody>
                  {computed.collectors.map(c => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>{(c.massFlowRate_kg_h ?? 0).toFixed(1)}</td>
                      <td>{(c.diameter_mm ?? 0).toFixed(0)}</td>
                      <td>{((c.dpCollectorCircuit_Pa ?? 0)/1000).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
