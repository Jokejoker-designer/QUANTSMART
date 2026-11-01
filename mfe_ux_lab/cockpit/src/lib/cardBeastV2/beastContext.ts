import {getCardRuntimeConfig,isTimeframe} from "../simTimeframe.ts";
export interface BeastOperatingContext {symbol:string;design_tf:string;execution_tf:string}
export function resolveBeastContext(cards:{id?:string;symbol?:string;design_tf?:string;execution_tf?:string;modules?:string[]}[],fallback:BeastOperatingContext={symbol:"XAUUSD",design_tf:"M15",execution_tf:"M15"}):BeastOperatingContext {
 const contexts=cards.map(card=>{const cfg=getCardRuntimeConfig(card);return {symbol:card.symbol||"XAUUSD",design_tf:cfg.design_tf,execution_tf:cfg.allowed_execution_tf};});
 const context=contexts[0]||fallback;
 if(!isTimeframe(context.design_tf)||!isTimeframe(context.execution_tf)||!/^[A-Z0-9]{3,12}$/.test(context.symbol))throw new Error("Invalid Beast operating context.");
 if(contexts.some(c=>c.symbol!==context.symbol||c.design_tf!==context.design_tf||c.execution_tf!==context.execution_tf))throw new Error("Beast member Cards must use the same symbol, design timeframe and execution timeframe. Review each Card before combining them.");
 return context;
}
