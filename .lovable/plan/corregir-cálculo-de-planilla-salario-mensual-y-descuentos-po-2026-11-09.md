# Corregir cálculo de planilla: salario mensual y descuentos por corte

## Problemas confirmados
1. **Salario mensual pagado por días marcados.** Hoy un colaborador con modalidad "Salario mensual" cobra salario ÷ 30 × 8 h por cada día con jornada. Si no marca un día, no lo cobra; si no marca nada en el mes, no aparece en la planilla.
2. **Descuentos de ley por quincena/semana.** ISSS, AFP y renta se calculan sobre cada corte con la tabla y topes mensuales: el tope de ISSS se aplica dos veces y la renta progresiva queda sub-retenida.

## Qué se cambiaría
- **Salario mensual:** el bruto base es el salario mensual completo (o la mitad en cada quincena). Las jornadas marcadas solo suman extras, recargos de descanso y feriados. Todos los colaboradores con salario mensual registrado aparecen en la planilla aunque no hayan marcado.
- **Jornal diario:** sin cambios (se paga por día trabajado).
- **Descuentos por corte:**
  - Quincena 1: descuentos calculados sobre la proyección mensual y retenida la mitad.
  - Quincena 2 / semana final: descuentos del total del mes menos lo ya retenido en cortes guardados del mismo mes — así la suma de cortes siempre coincide con el mes completo y el tope de ISSS nunca se excede.
  - Semanas (jornal): mismo criterio acumulado dentro del mes.
- Los periodos ya **cerrados** no se recalculan ni modifican.

## Detalles técnicos
- `src/lib/nomina.server.ts` (`calcularNominaRango`): para modalidad "mensual", `pago_ordinario` = salario × fracción del corte (1 mes = 1, quincena = 0.5); horas ordinarias de días hábiles dejan de sumar pago; incluir colaboradores de `nomina_salarios` sin jornadas.
- `src/lib/nomina.functions.ts` (`guardarNominaMes`): descuentos acumulados del mes = `calcularDescuentos(bruto_acumulado_mes)` − descuentos ya guardados en `nomina_periodo_detalle` de cortes previos del mismo mes.
- Pruebas nuevas en `src/lib/__tests__/`: salario $600 con 22 días marcados → bruto $600 + extras; dos quincenas de $1,200 → ISSS total ≤ $30 y renta total igual a la del mes completo.

## Antes de aprobar
Confirma que en EA el salario mensual se paga completo aunque el colaborador no marque (ausencias se descuentan aparte, a mano, con "otros descuentos").
