import React from "react";
import { pdf } from "@react-pdf/renderer";
import fs from "node:fs";
import { ProgramacionDoc } from "/dev-server/src/lib/pdf/ProgramacionDoc.tsx";

function iso(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}

const semana_dias = [
  {fecha: iso(2026,8,17), in_month:true, feriado:false, items:[
    {id:'1',folio:'T-625189',servicio:'Limpieza Robotizada',estado:'en_progreso',planta_nombre:'IDC San José',hora:'07:00',dia_idx:0,duracion:3},
  ]},
  {fecha: iso(2026,8,18), in_month:true, feriado:false, items:[
    {id:'1',folio:'T-625189',servicio:'Limpieza Robotizada',estado:'en_progreso',planta_nombre:'IDC San José',hora:'07:00',dia_idx:1,duracion:3},
  ]},
  {fecha: iso(2026,8,19), in_month:true, feriado:false, items:[]},
  {fecha: iso(2026,8,20), in_month:true, feriado:false, items:[]},
  {fecha: iso(2026,8,21), in_month:true, feriado:false, items:[
    {id:'2',folio:'T-941286',servicio:'Limpieza Robotizada',estado:'programado',planta_nombre:'Edif. 8A y 8B CASW de San Bartolo',hora:'07:00',dia_idx:0,duracion:1},
  ]},
];

const mkSem = (n, dias) => ({semana_numero:n, dias});
const D = (fecha,in_month,feriado,items=[]) => ({fecha,in_month,feriado,items});
const ev = (planta, servicio, di, du, estado='programado') => ({id:'x',folio:'',servicio,estado,planta_nombre:planta,dia_idx:di,duracion:du});

const mes_semanas = [
  mkSem(31,[
    D(iso(2026,7,27),false,false,[ev('El Ángel Techo I','Limpieza Robotizada',0,4)]),
    D(iso(2026,7,28),false,false,[ev('El Ángel Techo I','Limpieza Robotizada',1,4)]),
    D(iso(2026,7,29),false,false,[ev('El Ángel Techo I','Limpieza Robotizada',2,4)]),
    D(iso(2026,7,30),false,false,[ev('Plantel Tacoplast','Mantenimiento Menor',0,1),ev('El Ángel Techo I','Limpieza Robotizada',3,4)]),
    D(iso(2026,7,31),false,false,[ev('Apopa Energy central','Limpieza Robotizada',0,6)]),
  ]),
  mkSem(32,[
    D(iso(2026,8,3),true,false,[ev('Apopa Energy central','Limpieza Robotizada',1,6)]),
    D(iso(2026,8,4),true,false,[ev('Apopa Energy central','Limpieza Robotizada',2,6)]),
    D(iso(2026,8,5),true,false,[ev('Apopa Energy central','Limpieza Robotizada',3,6)]),
    D(iso(2026,8,6),true,true,[]),
    D(iso(2026,8,7),true,true,[]),
  ]),
  mkSem(33,[
    D(iso(2026,8,10),true,false,[ev('Apopa Energy central','Limpieza Robotizada',4,6)]),
    D(iso(2026,8,11),true,false,[ev('Apopa Energy central','Limpieza Robotizada',5,6)]),
    D(iso(2026,8,12),true,false,[ev('Planta Telares de Apopa Energy','Limpieza Robotizada',0,2)]),
    D(iso(2026,8,13),true,false,[ev('Cerosa','Mantenimiento Mayor',0,1),ev('Planta Telares de Apopa Energy','Limpieza Robotizada',1,2)]),
    D(iso(2026,8,14),true,false,[ev('IDC Celeritas','Limpieza Robotizada',0,3)]),
  ]),
  mkSem(34,[
    D(iso(2026,8,17),true,false,[ev('IDC Celeritas','Limpieza Robotizada',1,3)]),
    D(iso(2026,8,18),true,false,[ev('IDC Celeritas','Limpieza Robotizada',2,3)]),
    D(iso(2026,8,19),true,false,[ev('IDC San José','Limpieza Robotizada',0,3)]),
    D(iso(2026,8,20),true,false,[ev('IDC San José','Limpieza Robotizada',1,3)]),
    D(iso(2026,8,21),true,false,[ev('IDC San José','Limpieza Robotizada',2,3)]),
  ]),
  mkSem(35,[
    D(iso(2026,8,24),true,false,[ev('Edif. 8A y 8B CASW de San Bartolo','Limpieza Robotizada',0,1)]),
    D(iso(2026,8,25),true,false,[]),
    D(iso(2026,8,26),true,false,[ev('Cerosa','Limpieza Robotizada',0,1)]),
    D(iso(2026,8,27),true,false,[]),
    D(iso(2026,8,28),true,false,[]),
  ]),
];

const trabajos = [{id:'1',folio:'T-1',servicio:'Limpieza',estado:'programado',fecha_programada:new Date().toISOString()}];

async function make(name, data){
  const blob = await pdf(React.createElement(ProgramacionDoc,{data})).toBuffer();
  const chunks=[]; for await (const c of blob) chunks.push(c);
  fs.writeFileSync(`/tmp/pdf-qa/${name}.pdf`, Buffer.concat(chunks));
  console.log("wrote",name);
}

await make("semana",{vista:"semana",headerTitle:"Semana del 17 ago",trabajos,semana_dias,paper:"A4",orientation:"landscape",emitido_at:"25 jul 2026, 10:00"});
await make("mes",{vista:"mes",headerTitle:"agosto 2026",trabajos,mes_semanas,mes_columnas:["Lun","Mar","Mié","Jue","Vie"],paper:"A4",orientation:"landscape",emitido_at:"25 jul 2026, 10:00"});
