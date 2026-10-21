import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["var(--chart-3)", "var(--chart-2)", "var(--chart-1)", "var(--chart-5)", "var(--chart-4)", "var(--muted-foreground)"];

export function TrabajosSemanaChart({ data }: { data: any[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip position={{ x: 0, y: 0 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, whiteSpace: "normal", maxWidth: "100%" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="programado" stackId="a" fill="var(--chart-1)" name="Programados" />
          <Bar dataKey="en_progreso" stackId="a" fill="var(--chart-3)" name="En progreso" />
          <Bar dataKey="completado" stackId="a" fill="var(--chart-2)" name="Completados" />
          <Bar dataKey="cancelado" stackId="a" fill="var(--muted-foreground)" name="Cancelados" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistribucionTipoChart({ data }: { data: any[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
            {data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
          </Pie>
          <Tooltip position={{ x: 0, y: 0 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, whiteSpace: "normal", maxWidth: "100%" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopPlantasChart({ data }: { data: any[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11 }} width={140} />
          <Tooltip position={{ x: 0, y: 0 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, whiteSpace: "normal", maxWidth: "100%" }} />
          <Bar dataKey="count" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AguaPlantaChart({ data }: { data: any[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11 }} width={140} />
          <Tooltip
            position={{ x: 0, y: 0 }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, whiteSpace: "normal", maxWidth: "100%" }}
            formatter={(v: any) => [`${Math.round(Number(v)).toLocaleString()} gal`, "Agua"]}
          />
          <Bar dataKey="galones" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}