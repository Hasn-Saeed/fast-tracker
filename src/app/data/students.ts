export type Student = {
  tagId: string;
  name: string;
  address: string;
  stopLat: number;
  stopLon: number;
  stopOrder: number;
  parentName?: string;
  parentPhone?: string;
};

export const STUDENTS_BY_TAG: Record<string, Student> = {

  "60E6963F": {
    tagId: "60E6963F",
    name: "Abdul Basit",
    address: "3104 Rotary Way, Burlington, ON",
    stopLat: 43.39604,
    stopLon: -79.82358,
    stopOrder: 1,
    parentName: "Mr. Khan",
  },

  "535EBBD9": {
    tagId: "535EBBD9",
    name: "Syed Taha Mansoor",
    address: "4614 Doug Wright Dr, Burlington, ON",
    stopLat: 43.40406,
    stopLon: -79.824936,
    stopOrder: 2,
    parentName: "Mr. Mansoor",
  },
};