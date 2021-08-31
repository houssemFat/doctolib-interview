import pkg from "knex";
const { knex } = pkg;
// Uncomment and use date-fns if you want.
import { format, isValid, addDays, parseISO } from "date-fns";
/**
 * Event we retrive from, 
 * note here we add the key day to simplify maniuplating 
 * @typedef DBEvent
 * @type {object}
 * @property {number} id -
 * @property {string} day_of_week - day of week . We used to map the keys 
 * @property {string} starts_at - start of event
 * @property {string} starts_at - end of event
 * @property {string} ends_at - your name.
 * @property {string} kind - enum, one of  ["appointment", "opening"]
 * @property {boolean} weekly_recurring - 
 */
// Please keep this named export as it is.
export const knexClient = knex({
  client: "sqlite3",
  connection: ":memory:",
  /* connection: {
    filename: "./mydb.sqlite"
  },*/
  debug: true,
  useNullAsDefault: true,
});
// Please keep this named export as it is.
export const migrate = () =>
  knexClient.schema.createTable("events", (table) => {
    table.increments();
    table.dateTime("starts_at").notNullable();
    table.dateTime("ends_at").notNullable();
    table.enum("kind", ["appointment", "opening"]).notNullable();
    table.boolean("weekly_recurring");
  });
/**
 * Remove duplicates from array 
 * @param {Array} array 
 * @returns 
 */
const unique = (array) => {
  return [...new Set(array)];
}
/**
 * Return a Map (dict), keys are the days 
 * @param {Date} startOfWeek 
 * @returns {Map} 
 */
const buildWeekMap = (startOfWeek) => {
  // Prepare the map so
  let eventsByDay = new Map();
  for (let i = 0; i < 7; i++) {
    // skip first element
    if (i == 0) {
      eventsByDay.set(startOfWeek, []);
      continue;
    }
    eventsByDay.set(addDays(startOfWeek, i), []);
  }
  return eventsByDay;
}
/**
 * Given an event we returns the slots occupated 
 * @param {DBEvent} event
 * @returns 
 */
const getEventSlots = (event) => {
  // Assuming that all slots are 30 minutes 
  let slotUnit = 30;
  let startAt = parseISO(event.starts_at);
  let endAt = parseISO(event.ends_at);
  let milleseconds = endAt - startAt;
  let minutes = milleseconds / 1000 / 60;
  let slotsNumber = minutes / slotUnit;
  let i = 0;
  // minutes hours format variables
  let m, h;
  let slots = [];
  // Note here we don't store the ending of event, id doesn't matter for availability 
  while (i < slotsNumber) {
    m = startAt.getMinutes();
    if (('' + m).length == 1) {
      m = '0' + m
    }
    h = startAt.getHours();
    /*
    if (('' + h).length == 1) {
      h = '0' + h
    }*/
    slots.push(`${h}:${m}`);
    // incremnt by 
    startAt.setMinutes(startAt.getMinutes() + slotUnit);
    i++;
  }
  return slots;
  //return slots.sort((a, b) => a > b ? 1 : - 1);
}
/**
 * Given a list of openings slots and appointments, the function will retrieve all appointments from opening slots. 
 * This is shouldn't take a lot of thime as the maximum items per array is 8h x 2 (16)   
 * @param {Array.<string>} openings 
 * @param {Array.<string>} appointments 
 * @returns 
 */
const retrieveAppointmentsFromOpenings = (openings, appointments) => {
  return openings.filter(e => !appointments.includes(e))
}

/**
 * Given a date, the function returns all events for this week (recurrent (opening)  + appointements) 
 * @param {Date} date 
 * @returns {Array.<DBEvent>}
 */
const getDBWeekEvents = async (date) => {
  if (!isValid(date)) {
    throw new Error('invliad date');
  }
  // find all events in this upcoming week starting from the day 
  // 1 - opening && weekly_recurring =  true (ignore  'appointment', will covered in the or query )
  // 2 - or appointments   (this case including the 1 case for kind 'appointment')
  let nextWeekDay = addDays(date, 7)

  // All opening && weekly_recurring
  let openingsQuery = `weekly_recurring = true AND kind = 'opening'`;
  // All appointments of the week (including kind opening with no weekly_recurring)
  let appointementcsQuery = `strftime('%s', starts_at)  >= strftime('%s', :startOfWeek)  AND strftime('%s', ends_at)  <= strftime('%s', :endOfWeek)`;

  let rawQuery = knexClient.raw(`( ${openingsQuery} ) OR ( ${appointementcsQuery} )`, { startOfWeek: date.toISOString(), endOfWeek: nextWeekDay.toISOString() });

  // prepare the day of week key 
  let selectRaw = knexClient.raw(`strftime('%w', starts_at) as day_of_week, *`);

  return await knexClient('events').select(selectRaw).where(rawQuery);

}

/**
 * Given an array of events, sorted by starts_as
 * We build interval for each day 
 * @param {Date} startOfWeek 
 * @param {Array.<DBEvent>} events 
 */
const findAvailablitiesFromEvents = (startOfWeek, events) => {
  if (!isValid(startOfWeek)) {
    throw new Error('invliad date');
  }
  let openingsByDay = buildWeekMap(startOfWeek);
  // build intermediaire Map contains dates by day of week 
  // For a recurent event, we should consider the day instead 
  let datesByDayOfweek = new Map();
  openingsByDay.forEach((_, date) => {
    datesByDayOfweek.set(date.getDay(), date)
  });

  // we should contruct all our avaiblaes slot in one loop

  if (events.length) {
    let currentDayKey, currentEventSlots;
    let openings = [];
    events.forEach(
      (event) => {
        currentDayKey = datesByDayOfweek.get(parseInt(event.day_of_week));
        currentEventSlots = getEventSlots(event);
        openings = openingsByDay.get(currentDayKey);
        // in opening , we add to already added slots
        if (event.kind === "opening") {
          openings = openings.concat(currentEventSlots);
        }
        // if appointments, we retrieve them
        if (event.kind === "appointment") {
          openings = retrieveAppointmentsFromOpenings(openings, currentEventSlots)
        }
        openingsByDay.set(currentDayKey, unique(openings));
      }
    );
  }
  // now loop all over values in slotsByDay dict and merge
  return openingsByDay;
}

/**
 * Return a Map (dict), keys are the days 
 * @param {Map} openeingByDay 
 * @returns {Object} 
 */
const formatResults = (openeingByDayMap) => {
  // Prepare the map so
  let openeingByDay = {};
  let currentDate;
  openeingByDayMap.forEach((value, keyDate) => {
    currentDate = format(keyDate, 'yyyy-MM-dd');
    openeingByDay[currentDate] = value;
  })
  return openeingByDay;
}
/**
 * 
 * @param {Date} date 
 */
const getAvailabilities = async (date) => {
  if (!isValid(date)) {
    throw new Error('invliad date');
  }
  // Implement your algorithm here. Create as many functions as you like, but no extra files please.
  let events = await getDBWeekEvents(date);
  let results = findAvailablitiesFromEvents(date, events);
  return formatResults(results);
};
// Please keep this default export as it is.
export default getAvailabilities;
