export const MODE_EXISTING = 'existing'
export const MODE_FIXED = 'fixed'
export const MODE_PUMP = 'pump'
export const MODE_BAL = 'balancing'

export const INSULATION_U_VALUES: Record<string, {wall:number, roof:number, ground:number}> = {
  'not insulated': { wall: 1.3, roof: 1.0, ground: 1.2 },
  'bit insulated': { wall: 0.6, roof: 0.4, ground: 0.5 },
  'insulated well': { wall: 0.3, roof: 0.2, ground: 0.3 },
}

export const GLAZING_U_VALUES: Record<string, number> = {
  single: 5.0,
  double: 2.8,
  triple: 0.8,
}

export const ROOM_TYPE_OPTIONS = ['Living','Kitchen','Bedroom','Laundry','Bathroom','Toilet'] as const

export type PumpCurvePoint = [number, number] // [flow kg/h, head kPa]
export type PumpCurve = PumpCurvePoint[]
export type PumpLibrary = Record<string, Record<string, PumpCurve>>

export const PUMP_LIBRARY: PumpLibrary = {
  'Grundfos UPM3 15-70': {
    speed_1: [[0,55],[200,50],[400,42],[600,30],[800,18],[1000,6],[1100,2]],
    speed_2: [[0,65],[250,60],[500,51],[750,38],[1000,24],[1150,12],[1250,5]],
    speed_3: [[0,75],[300,70],[600,60],[900,44],[1200,28],[1400,16],[1500,8]],
  },
  'Wilo Yonos PICO 25-1/6': {
    speed_1: [[0,50],[250,44],[500,36],[750,26],[1000,15],[1200,7]],
    speed_2: [[0,60],[300,54],[600,45],[900,33],[1200,20],[1400,12]],
    speed_3: [[0,70],[350,64],[700,54],[1050,40],[1400,26],[1600,15]],
  },
  'Generic 25-60': {
    speed_1: [[0,48],[250,42],[500,34],[750,24],[1000,13],[1200,6]],
    speed_2: [[0,58],[300,52],[600,44],[900,32],[1200,19],[1400,11]],
    speed_3: [[0,68],[350,62],[700,52],[1050,38],[1400,24],[1600,14]],
  },
}
