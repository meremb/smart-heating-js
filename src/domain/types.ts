// src/domain/types.ts
export type RadiatorRow = {
  radiatorNr: number
  collector: string

  // inputs
  heatLoss_W: number
  radiatorPower_75_65_20_W: number
  electricPower_W?: number
  lengthCircuit_m: number

  // thermal results
  supplyTemp_C?: number
  returnTemp_C?: number
  massFlowRate_kg_h?: number

  // hydraulics results
  diameter_mm?: number
  dpPiping_Pa?: number
  dpRadiatorBody_Pa?: number
  dpCircuit_Pa?: number
  totalPressureLoss_Pa?: number
  dpTotal_Pa?: number

  // valve
  valveName: string
  valvePosition: number
  valveKv?: number
  dpValve_Pa?: number
  valvePressureLossOpen_Pa?: number
}

export type CollectorRow = {
  name: string
  length_m: number
  diameter_mm?: number
  massFlowRate_kg_h?: number
  dpCollectorCircuit_Pa?: number
}

export type ValveOverride = {
  valveName?: string
  position?: number
  kv?: number
}

// overrides per radiator number
export type ValveOverrides = Record<number, ValveOverride>
