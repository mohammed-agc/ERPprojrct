import {
  mockDepartments, mockUnits, mockPositions, mockAssignments,
} from "@/data/orgMockData";
import type { OrgProvider } from "../providers";
import type { OrgDepartment } from "../types";

const delay = (ms = 120) => new Promise(r => setTimeout(r, ms));

// In-memory mutable copies so saves persist within a session.
const _departments: OrgDepartment[] = [...mockDepartments];

export const mockOrgProvider: OrgProvider = {
  async listDepartments() { await delay(); return [..._departments]; },
  async listUnits()       { await delay(); return [...mockUnits]; },
  async listPositions()   { await delay(); return [...mockPositions]; },
  async listAssignments() { await delay(); return [...mockAssignments]; },
  async saveDepartment(d) {
    await delay();
    const i = _departments.findIndex(x => x.id === d.id);
    if (i >= 0) _departments[i] = d; else _departments.push(d);
    return d;
  },
};
