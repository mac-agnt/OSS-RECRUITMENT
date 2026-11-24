/* Clients and venues. Venues are real Irish locations; client companies are
   fictional except Aiken Promotions, an existing OSS client. Contacts are fictional. */

import type { Client, Venue } from "../model";

export const CLIENTS: Omit<Client, "createdAt">[] = [
  { id: "C01", name: "Aiken Promotions", contact: "Gráinne Lacey", email: "grainne.lacey@example.test", phone: "01 555 0140", bullhornId: "BH-CORP-2301" },
  { id: "C02", name: "Lansdowne Stadium Services Ltd", contact: "Paul Sheridan", email: "paul.sheridan@example.test", phone: "01 555 0152", bullhornId: "BH-CORP-2308" },
  { id: "C03", name: "Aquatics Events Ireland Ltd", contact: "Ellen Mahon", email: "ellen.mahon@example.test", phone: "01 555 0161", bullhornId: "BH-CORP-2315" },
  { id: "C04", name: "Liffey Corporate Events Ltd", contact: "Niamh Brophy", email: "niamh.brophy@example.test", phone: "01 555 0177", bullhornId: "BH-CORP-2322" },
  { id: "C05", name: "Quayside Events Ltd", contact: "Ross Hayden", email: "ross.hayden@example.test", phone: "01 555 0178", bullhornId: "BH-CORP-2329" },
  { id: "C06", name: "Ploughshare Exhibitions Ltd", contact: "Martina Cregan", email: "martina.cregan@example.test", phone: "01 555 0183", bullhornId: "BH-CORP-2336" },
  { id: "C07", name: "Stradbally Festival Productions Ltd", contact: "Owen Furlong", email: "owen.furlong@example.test", phone: "057 555 0190", bullhornId: "BH-CORP-2343" },
  { id: "C08", name: "Fairway Event Operations Ltd", contact: "Helen Kinsella", email: "helen.kinsella@example.test", phone: "061 555 0195", bullhornId: "BH-CORP-2350" },
  { id: "C09", name: "Grand Canal Theatre Productions Ltd", contact: "Dara Lawlor", email: "dara.lawlor@example.test", phone: "01 555 0199", bullhornId: "BH-CORP-2357" }
];

const v = (id: string, name: string, address: string, county: string, lat: number, lng: number, meeting: string, qr = true): Venue =>
  ({ id, name, address, county, lat, lng, radiusM: 50, meeting, qr });

export const VENUES: Venue[] = [
  v("V01", "3Arena", "North Wall Quay, Dublin 1", "Dublin", 53.3475, -6.2286, "Staff entrance at the loading bay, Gate C"),
  v("V02", "Aviva Stadium", "Lansdowne Road, Dublin 4", "Dublin", 53.3352, -6.2285, "Staff accreditation, West Stand, Gate O"),
  v("V03", "National Aquatic Centre", "Snugborough Road, Blanchardstown, Dublin 15", "Dublin", 53.399, -6.361, "Staff door beside the main car park", false),
  v("V04", "Guinness Storehouse", "St James's Gate, Dublin 8", "Dublin", 53.3419, -6.2867, "Events entrance on Market Street"),
  v("V05", "Convention Centre Dublin", "Spencer Dock, North Wall Quay, Dublin 1", "Dublin", 53.3478, -6.2394, "Loading bay on Mayor Street Upper"),
  v("V06", "RDS Simmonscourt", "Simmonscourt Road, Ballsbridge, Dublin 4", "Dublin", 53.3255, -6.229, "Simmonscourt Hall service gate", false),
  v("V07", "Bord Gáis Energy Theatre", "Grand Canal Square, Dublin 2", "Dublin", 53.344, -6.2402, "Stage door on Misery Hill"),
  v("V08", "Stradbally Hall (Electric Picnic)", "Stradbally, Co. Laois", "Laois", 53.0098, -7.1527, "Crew gate on the Stradbally road"),
  v("V09", "Adare Manor: course", "Adare, Co. Limerick", "Limerick", 52.5636, -8.7881, "Course operations compound, Gate 2"),
  v("V10", "Adare Manor: spectator village", "Adare, Co. Limerick", "Limerick", 52.5668, -8.7935, "Village staff entrance beside the hospitality marquees"),
  v("V11", "Limerick Racecourse park and ride", "Greenmount Park, Patrickswell, Co. Limerick", "Limerick", 52.5986, -8.7194, "Car park cabin at the main gate"),
  v("V12", "Fan zone: Limerick city", "Arthur's Quay Park, Limerick", "Limerick", 52.6638, -8.6267, "Fan zone crew tent by the river")
];
