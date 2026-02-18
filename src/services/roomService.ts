import { RoomLoadCalculator } from '../domain/heatLoad'

export type RoomRow = Record<string, any>

export function defaultRoomTable(numRooms: number): RoomRow[] {
  const n = Math.max(1, Math.floor(numRooms || 1))
  return Array.from({length: n}, (_,i) => ({
    'Room #': i+1,
    'Indoor Temp (°C)': 20.0,
    'Floor Area (m²)': 20.0,
    'Walls external': 2,
    'Room Type': 'Living',
    'On Ground': false,
    'Under Roof': false,
  }))
}

export function computeRoomResults(
  roomRows: RoomRow[],
  uw: number,
  u_roof: number,
  u_ground: number,
  u_glass: number,
  tout: number,
  heat_loss_area_estimation: 'fromFloorArea'|'fromExposedPerimeter',
  ventilation_calculation_method: 'simple'|'NBN-D-50-001',
  v_system: 'C'|'D',
  v50: number,
  neighbour_t: number,
  un: number,
  lir: number,
  wall_height: number,
  return_detail: boolean,
  add_neighbour_losses: boolean,
): {Room:number, 'Total Heat Loss (W)': number}[] {
  const results: {Room:number, 'Total Heat Loss (W)': number}[] = []
  for (const row of (roomRows || [])){
    const calc = new RoomLoadCalculator({
      floor_area: num(row['Floor Area (m²)'], 0),
      uw, u_roof, u_ground,
      v_system,
      tin: num(row['Indoor Temp (°C)'], 20),
      tout,
      neighbour_t,
      un,
      lir,
      heat_loss_area_estimation,
      ventilation_calculation_method,
      on_ground: !!row['On Ground'],
      under_roof: !!row['Under Roof'],
      add_neighbour_losses,
      neighbour_perimeter: num(row['Neighbour Perimeter (m)'], 0),
      room_type: row['Room Type'] ?? 'Living',
      wall_height,
      wall_outside: num(row['Walls external'], 2),
      return_detail,
      window: true,
      u_glass,
    })
    const res: any = calc.compute()
    const total = (typeof res === 'number') ? res : (res.totalHeatLoss ?? 0)
    results.push({ Room: Number(row['Room #'] ?? 0), 'Total Heat Loss (W)': Number(total || 0) })
  }
  return results
}

export function splitHeatLossToRadiators(radiatorRows: any[], roomResults: {Room:number, 'Total Heat Loss (W)': number}[]): { 'Radiator nr': any, 'Calculated Heat Loss (W)': number, Room: any }[] {
  if (!roomResults?.length || !radiatorRows?.length) return []
  const roomMap = new Map<number, number>()
  roomResults.forEach(r => roomMap.set(Number(r.Room), Number(r['Total Heat Loss (W)'] || 0)))

  const byRoom = new Map<any, any[]>()
  radiatorRows.forEach(r => {
    const room = r['Room']
    if (!byRoom.has(room)) byRoom.set(room, [])
    byRoom.get(room)!.push(r)
  })

  const out: any[] = []
  radiatorRows.forEach(r => {
    const room = r['Room']
    const list = byRoom.get(room) || []
    const n = list.length || 1
    const split = (roomMap.get(Number(room)) ?? 0) / n
    out.push({ 'Radiator nr': r['Radiator nr'], 'Calculated Heat Loss (W)': split, Room: room })
  })
  return out
}

function num(x:any, d:number){
  const v = Number(x)
  return Number.isFinite(v) ? v : d
}
