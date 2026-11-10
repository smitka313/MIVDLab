/**
 * Applies supabase/migrations to a scratch PostgreSQL database (with a minimal
 * Supabase auth shim) and verifies authorization as real database roles.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const root = join(__dirname, "../../supabase");
const dbName = `classpulse_test_${Date.now()}`;
let admin: Client;
let db: Client;
const A = randomUUID();
const B = randomUUID();

/** Run `fn` as an authenticated Supabase user inside a transaction that is rolled back unless `commit`. */
async function as<T>(uid: string | null, fn: (c: Client) => Promise<T>, commit = false): Promise<T> {
  await db.query("begin");
  try {
    if (uid) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    } else {
      await db.query("set local role anon");
    }
    const r = await fn(db);
    await db.query(commit ? "commit" : "rollback");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function seedTeacher(uid: string) {
  return as(
    uid,
    async (c) => {
      const cls = await c.query(`insert into classes (course_name, period) values ('Biology', '1') returning id`);
      const st = await c.query(`insert into students (first_name, last_name) values ('Ana', 'Rivera') returning id`);
      await c.query(`insert into enrollments (class_id, student_id) values ($1, $2)`, [cls.rows[0].id, st.rows[0].id]);
      const status = await c.query(`insert into attendance_statuses (code, label, counts_as) values ('P','Present','present') returning id`);
      await c.query(`insert into attendance_records (class_id, student_id, date, status_id) values ($1,$2,'2026-11-10',$3)`, [cls.rows[0].id, st.rows[0].id, status.rows[0].id]);
      await c.query(`insert into observations (student_id, class_id, kind, category_name, behavior_label) values ($1,$2,'positive','Positive','Helped another student')`, [st.rows[0].id, cls.rows[0].id]);
      await c.query(`insert into student_notes (student_id, body) values ($1, 'private note')`, [st.rows[0].id]);
      return { classId: cls.rows[0].id as string, studentId: st.rows[0].id as string };
    },
    true,
  );
}

let a: { classId: string; studentId: string };
let b: { classId: string; studentId: string };

describe.skipIf(!url)("database authorization (RLS)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const u = new URL(url!);
    u.pathname = `/${dbName}`;
    db = new Client({ connectionString: u.toString() });
    await db.connect();
    await db.query(readFileSync(join(root, "tests/auth_shim.sql"), "utf8"));
    for (const f of readdirSync(join(root, "migrations")).sort()) await db.query(readFileSync(join(root, "migrations", f), "utf8"));
    await db.query(`insert into auth.users (id, email) values ($1, 'a@example.test'), ($2, 'b@example.test')`, [A, B]);
    a = await seedTeacher(A);
    b = await seedTeacher(B);
  });

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    }
  });

  it("creates a profile and preferences for each new user", async () => {
    const r = await db.query(`select count(*)::int n from profiles where id in ($1,$2)`, [A, B]);
    expect(r.rows[0].n).toBe(2);
    const p = await db.query(`select count(*)::int n from user_preferences where teacher_id in ($1,$2)`, [A, B]);
    expect(p.rows[0].n).toBe(2);
  });

  it("a teacher sees only their own records", async () => {
    await as(A, async (c) => {
      for (const t of ["classes", "students", "enrollments", "observations", "attendance_records", "student_notes"]) {
        const r = await c.query(`select teacher_id from ${t}`);
        expect(r.rows.length, t).toBeGreaterThan(0);
        expect(r.rows.every((x) => x.teacher_id === A), t).toBe(true);
      }
    });
  });

  it("a teacher cannot read another teacher's student by id", async () => {
    const r = await as(B, (c) => c.query(`select * from students where id = $1`, [a.studentId]));
    expect(r.rows).toHaveLength(0);
  });

  it("a teacher cannot update or delete another teacher's records", async () => {
    await as(B, async (c) => {
      const u = await c.query(`update students set first_name = 'Hacked' where id = $1`, [a.studentId]);
      expect(u.rowCount).toBe(0);
      const d = await c.query(`delete from observations where student_id = $1`, [a.studentId]);
      expect(d.rowCount).toBe(0);
    });
    const check = await db.query(`select first_name from students where id = $1`, [a.studentId]);
    expect(check.rows[0].first_name).toBe("Ana");
  });

  it("a teacher cannot insert rows owned by someone else", async () => {
    await expect(as(B, (c) => c.query(`insert into students (teacher_id, first_name, last_name) values ($1, 'X', 'Y')`, [A]))).rejects.toThrow(/row-level security/);
  });

  it("a teacher cannot attach their records to another teacher's class or student", async () => {
    await expect(as(B, (c) => c.query(`insert into enrollments (class_id, student_id) values ($1, $2)`, [a.classId, b.studentId]))).rejects.toThrow(/foreign key/);
    await expect(as(B, (c) => c.query(`insert into observations (student_id, class_id, kind, category_name, behavior_label) values ($1,$2,'positive','P','x')`, [a.studentId, b.classId]))).rejects.toThrow(/foreign key/);
  });

  it("a teacher cannot transfer a record to another owner", async () => {
    await expect(as(A, (c) => c.query(`update students set teacher_id = $1 where id = $2`, [B, a.studentId]))).rejects.toThrow();
  });

  it("anonymous visitors can read nothing", async () => {
    await expect(as(null, (c) => c.query(`select * from students`))).rejects.toThrow(/permission denied/);
  });

  it("explicit read grants share classroom records but never private notes, and are read-only", async () => {
    await as(A, (c) => c.query(`insert into data_access_grants (owner_id, grantee_id) values ($1, $2)`, [A, B]), true);
    await as(B, async (c) => {
      const s = await c.query(`select id from students where teacher_id = $1`, [A]);
      expect(s.rows).toHaveLength(1);
      const n = await c.query(`select id from student_notes where teacher_id = $1`, [A]);
      expect(n.rows).toHaveLength(0);
      const u = await c.query(`update students set first_name = 'Edit' where id = $1`, [a.studentId]);
      expect(u.rowCount).toBe(0);
    });
    // B cannot create grants on A's behalf
    await expect(as(B, (c) => c.query(`insert into data_access_grants (owner_id, grantee_id) values ($1, $2)`, [A, B]))).rejects.toThrow(/row-level security/);
    await as(A, (c) => c.query(`update data_access_grants set revoked_at = now() where owner_id = $1`, [A]), true);
    const after = await as(B, (c) => c.query(`select id from students where teacher_id = $1`, [A]));
    expect(after.rows).toHaveLength(0);
  });

  it("records an audit trail of corrections that users cannot alter", async () => {
    await as(A, (c) => c.query(`update observations set behavior_label = 'Helped a peer with the lab' where student_id = $1`, [a.studentId]), true);
    await as(A, async (c) => {
      const r = await c.query(`select action, old_data->>'behavior_label' old, new_data->>'behavior_label' new from audit_logs where table_name = 'observations' order by created_at`);
      expect(r.rows.map((x) => x.action)).toEqual(["insert", "update"]);
      expect(r.rows[1]).toMatchObject({ old: "Helped another student", new: "Helped a peer with the lab" });
    });
    await expect(as(A, (c) => c.query(`delete from audit_logs`))).rejects.toThrow(/permission denied/);
    await expect(as(A, (c) => c.query(`insert into audit_logs (teacher_id, table_name, record_id, action) values ($1,'x',$1,'insert')`, [A]))).rejects.toThrow(/permission denied/);
    const other = await as(B, (c) => c.query(`select * from audit_logs where teacher_id = $1`, [A]));
    expect(other.rows).toHaveLength(0);
  });

  it("users cannot change their own role", async () => {
    await expect(as(A, (c) => c.query(`update profiles set role = 'school_admin' where id = $1`, [A]))).rejects.toThrow(/permission denied/);
  });

  it("enforces one attendance record per student, class and day", async () => {
    await expect(
      as(A, async (c) => {
        const s = await c.query(`select status_id from attendance_records limit 1`);
        await c.query(`insert into attendance_records (class_id, student_id, date, status_id) values ($1,$2,'2026-11-10',$3)`, [a.classId, a.studentId, s.rows[0].status_id]);
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("deletes all classroom data for the caller only", async () => {
    await as(A, (c) => c.query(`select delete_my_classroom_data()`), true);
    expect((await db.query(`select count(*)::int n from students where teacher_id = $1`, [A])).rows[0].n).toBe(0);
    expect((await db.query(`select count(*)::int n from students where teacher_id = $1`, [B])).rows[0].n).toBe(1);
  });

  it("deletes an account and everything it owns", async () => {
    await as(B, (c) => c.query(`select delete_my_account()`), true);
    expect((await db.query(`select count(*)::int n from auth.users where id = $1`, [B])).rows[0].n).toBe(0);
    for (const t of ["profiles", "classes", "students", "observations", "audit_logs"]) {
      const col = t === "profiles" ? "id" : "teacher_id";
      expect((await db.query(`select count(*)::int n from ${t} where ${col} = $1`, [B])).rows[0].n, t).toBe(0);
    }
  });
});
