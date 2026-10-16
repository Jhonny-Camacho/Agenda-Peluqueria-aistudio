import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: any;

const workHours = [
  { weekday: 1, start: "09:00", end: "18:00" },
  { weekday: 2, start: "09:00", end: "18:00" },
  { weekday: 3, start: "09:00", end: "18:00" },
  { weekday: 4, start: "09:00", end: "18:00" },
  { weekday: 5, start: "09:00", end: "18:00" },
  { weekday: 6, start: "09:00", end: "15:00" },
];

const todayInLaPaz = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(
    new Date(),
  );

function createInMemoryDb() {
  console.warn("[AI Studio] DATABASE_URL not set — using in-memory salon database");

  const today = todayInLaPaz();
  const ownerEmail = (process.env.SALON_OWNER_EMAIL || "jhonnycamachog1962@gmail.com").trim().toLowerCase();

  let nextId = 100;
  const tables: Record<string, any[]> = {
    salon_services: [
      { id: 1, name: "Corte clásico", description: "Corte y acabado a medida", durationMinutes: 30, price: 50, active: true },
      { id: 2, name: "Corte y lavado", description: "Lavado relajante y corte", durationMinutes: 45, price: 80, active: true },
      { id: 3, name: "Barba y perfilado", description: "Toalla caliente y perfilado", durationMinutes: 30, price: 35, active: true },
      { id: 4, name: "Coloración", description: "Color completo y cuidado final", durationMinutes: 120, price: 250, active: true },
    ],
    salon_stylists: [
      { id: 1, name: "Valeria", title: "Especialista en cortes", active: true, workHours },
      { id: 2, name: "Mateo", title: "Barbero y colorista", active: true, workHours },
    ],
    salon_team: [
      { id: 1, email: ownerEmail, name: "Dueño", role: "owner" },
    ],
    salon_inventory: [
      { id: 1, name: "Shampoo nutritivo", sku: "CAB-SHAM-500", stock: 14, minimumStock: 4, price: 75, updatedAt: new Date() },
      { id: 2, name: "Cera de fijación mate", sku: "CAB-CERA-100", stock: 8, minimumStock: 3, price: 55, updatedAt: new Date() },
      { id: 3, name: "Aceite para barba", sku: "BAR-ACE-030", stock: 3, minimumStock: 5, price: 65, updatedAt: new Date() },
    ],
    salon_appointments: [
      { id: 1, clientName: "Sofía Rojas", phone: "70000001", serviceId: 1, stylistId: 1, date: today, startTime: "10:00", endTime: "10:30", status: "pending", source: "online", createdAt: new Date() },
      { id: 2, clientName: "Daniel Vargas", phone: "70000002", serviceId: 3, stylistId: 2, date: today, startTime: "11:00", endTime: "11:30", status: "attended", source: "whatsapp", createdAt: new Date() },
      { id: 3, clientName: "Camila Flores", phone: "70000003", serviceId: 1, stylistId: 1, date: today, startTime: "12:00", endTime: "12:30", status: "pending", source: "phone", createdAt: new Date() },
    ],
    salon_time_blocks: [],
  };

  function getTableName(table: any): string {
    if (!table) return "";
    return table._?.name || (table as any)[Symbol.for("drizzle:Name")] || "";
  }

  function matchesCondition(row: any, cond: any): boolean {
    if (!cond) return true;
    try {
      if (Array.isArray(cond)) {
        return cond.every(c => matchesCondition(row, c));
      }
      if (cond && typeof cond === "object") {
        if ("operator" in cond && "left" in cond && "right" in cond) {
          const colName = cond.left?._?.name || cond.left?.name || cond.left?.fieldName || cond.left?.key;
          const val = cond.right;
          const op = cond.operator;
          const rowVal = colName ? row[colName] : undefined;
          if (op === "=") return rowVal === val;
          if (op === "!=") return rowVal !== val;
          if (op === ">") return rowVal > val;
          if (op === "<") return rowVal < val;
        }
        if (cond.queryChunks) {
          return true;
        }
      }
    } catch {
      return true;
    }
    return true;
  }

  function formatRow(row: any, shape?: any): any {
    if (!shape) return { ...row };
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(shape)) {
      if (v && typeof v === "object") {
        const colName = (v as any)._?.name || (v as any).name || (v as any).fieldName || (v as any).key || k;
        res[k] = row[colName] !== undefined ? row[colName] : row[k];
      } else {
        res[k] = row[k];
      }
    }
    return res;
  }

  const memoryDb = {
    select(shape?: any) {
      let targetTable = "";
      let conditions: any[] = [];
      let joins: Array<{ table: any; cond: any }> = [];
      let limitCount: number | null = null;
      let orderFn: any = null;

      const queryObj: any = {
        from(tbl: any) {
          targetTable = getTableName(tbl);
          return queryObj;
        },
        where(...conds: any[]) {
          conditions.push(...conds);
          return queryObj;
        },
        orderBy(...orders: any[]) {
          orderFn = orders[0];
          return queryObj;
        },
        innerJoin(otherTbl: any, onCond: any) {
          joins.push({ table: otherTbl, cond: onCond });
          return queryObj;
        },
        limit(n: number) {
          limitCount = n;
          return queryObj;
        },
        then(resolve: (val: any) => void) {
          const rawRows = (tables[targetTable] || []).map(r => ({ ...r }));
          let joinedRows = rawRows;

          if (joins.length > 0) {
            joinedRows = rawRows.map(r => {
              const joined = { ...r };
              for (const j of joins) {
                const jName = getTableName(j.table);
                const otherRows = tables[jName] || [];
                if (jName === "salon_services") {
                  const s = otherRows.find(x => x.id === r.serviceId);
                  if (s) {
                    joined.serviceName = s.name;
                    joined.servicesTable = s;
                  }
                }
                if (jName === "salon_stylists") {
                  const st = otherRows.find(x => x.id === r.stylistId);
                  if (st) {
                    joined.stylistName = st.name;
                    joined.stylistsTable = st;
                  }
                }
              }
              return joined;
            });
          }

          let filtered = joinedRows.filter(r => matchesCondition(r, conditions));

          if (orderFn) {
            filtered.sort((a, b) => {
              const aKey = a.startTime || a.name || "";
              const bKey = b.startTime || b.name || "";
              return String(aKey).localeCompare(String(bKey));
            });
          }

          if (limitCount !== null) {
            filtered = filtered.slice(0, limitCount);
          }

          const result = filtered.map(r => formatRow(r, shape));
          resolve(result);
        },
      };

      return queryObj;
    },

    insert(tbl: any) {
      const targetTable = getTableName(tbl);
      let insertedVals: any[] = [];
      let returningShape: any = null;

      const insertObj: any = {
        values(v: any) {
          insertedVals = Array.isArray(v) ? v : [v];
          return insertObj;
        },
        onConflictDoUpdate() {
          return insertObj;
        },
        returning(shape?: any) {
          returningShape = shape || true;
          return insertObj;
        },
        then(resolve: (val: any) => void) {
          const target = tables[targetTable] || (tables[targetTable] = []);
          const added: any[] = [];
          for (const item of insertedVals) {
            const newItem = {
              id: item.id || ++nextId,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...item,
            };
            target.push(newItem);
            added.push(newItem);
          }
          const result = returningShape ? added.map(r => formatRow(r, returningShape === true ? undefined : returningShape)) : added;
          resolve(result);
        },
      };

      return insertObj;
    },

    update(tbl: any) {
      const targetTable = getTableName(tbl);
      let updateValues: any = {};
      let conditions: any[] = [];
      let returningShape: any = null;

      const updateObj: any = {
        set(vals: any) {
          updateValues = vals;
          return updateObj;
        },
        where(...conds: any[]) {
          conditions.push(...conds);
          return updateObj;
        },
        returning(shape?: any) {
          returningShape = shape || true;
          return updateObj;
        },
        then(resolve: (val: any) => void) {
          const target = tables[targetTable] || [];
          const updated: any[] = [];
          for (const r of target) {
            if (matchesCondition(r, conditions)) {
              Object.assign(r, updateValues);
              updated.push(r);
            }
          }
          const result = returningShape ? updated.map(r => formatRow(r, returningShape === true ? undefined : returningShape)) : updated;
          resolve(result);
        },
      };

      return updateObj;
    },

    delete(tbl: any) {
      const targetTable = getTableName(tbl);
      let conditions: any[] = [];
      let returningShape: any = null;

      const deleteObj: any = {
        where(...conds: any[]) {
          conditions.push(...conds);
          return deleteObj;
        },
        returning(shape?: any) {
          returningShape = shape || true;
          return deleteObj;
        },
        then(resolve: (val: any) => void) {
          const target = tables[targetTable] || [];
          const deleted: any[] = [];
          for (let i = target.length - 1; i >= 0; i--) {
            if (matchesCondition(target[i], conditions)) {
              deleted.unshift(target[i]);
              target.splice(i, 1);
            }
          }
          const result = returningShape ? deleted.map(r => formatRow(r, returningShape === true ? undefined : returningShape)) : deleted;
          resolve(result);
        },
      };

      return deleteObj;
    },

    async transaction(callback: (tx: any) => Promise<any>) {
      return callback(memoryDb);
    },

    async execute(_sql: any) {
      return { rows: [] };
    },
  };

  return memoryDb;
}

try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } else {
    db = createInMemoryDb();
  }
} catch (error) {
  console.warn("[AI Studio] Failed to connect to database — falling back to in-memory store", error);
  db = createInMemoryDb();
}

export * from "./schema";
