import { knex } from "knex";
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
 // debug: true,
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
 * Assuming that the slot is 30 minutes 
 * Given an event, it returns a list of string of times (HH:MM). Each element is a starting of a slot of 30 minutes.
 * It gives all possible intervals of 30 minutes between the start of the event starts_as and ends_at as strings except the last one.
 * @param {DBEvent} event
 * @returns {Array.<string>}
 */
const getEventSlots = (event) => {
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
  // Note here we don't store the end of event. 
  while (i < slotsNumber) {
    m = startAt.getMinutes();
    // this block is only for formatting when we have 0 minutes (0-9 in general case), so we add 0 in the left side 
    if (('' + m).length == 1) {
      m = '0' + m
    }
    h = startAt.getHours();
    /*
    if (('' + h).length == 1) {
      h = '0' + h
    }*/
    slots.push(`${h}:${m}`);
    // incremnt by 30 minutes
    startAt.setMinutes(startAt.getMinutes() + slotUnit);
    i++;
  }
  return slots;
}
/**
 * Given a list of openings slots and appointments, the function will retrieve all appointments from opening slots. 
 * This is shouldn't take a lot of thime as the maximum items per array is 8h x 2 (16)   
 * @param {Array.<string>} openings 
 * @param {Array.<string>} appointments 
 * @returns {Array.<string>
 * }
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
  // All appointments of the week (for the two Kind)
  let appointementcsQuery = `strftime('%s', starts_at)  >= strftime('%s', :startOfWeek)  AND strftime('%s', ends_at)  <= strftime('%s', :endOfWeek)`;

  // Order here so we don't need to re-sort it in the js code
  let orderByQuery = `ORDER BY strftime('%s', starts_at)`;

  let rawQuery = knexClient.raw(`( ${openingsQuery} ) OR ( ${appointementcsQuery} ) ${orderByQuery}`, { startOfWeek: date.toISOString(), endOfWeek: nextWeekDay.toISOString() });

  // prepare the day of week key so we can map it later 
  let selectRaw = knexClient.raw(`strftime('%w', starts_at) as day_of_week, starts_at, ends_at, kind`);

  return await knexClient('events').select(selectRaw).where(rawQuery);

}

/**
 * Given a start of the week and an array of events (sorted by starts_as date)
 * First it creates an empty Map of <Day, []>. Keys are days of the week starting from startOfWeek. Values are opening slots.
 * Loop all over the events :
 * - if event is opening, the add event slots to the corresponding map day array
 * - if event is appointment, the retreive event slots from the corresponding map day array
 * @param {Date} startOfWeek 
 * @param {Array.<DBEvent>} events 
 * @returns {Map}
 */
const findAvailablitiesFromEvents = (startOfWeek, events) => {
  if (!isValid(startOfWeek)) {
    throw new Error('invliad date');
  }
  let openingsByDay = buildWeekMap(startOfWeek);
  // Build temprary object contains dates by day of week 
  // It serves for mapping between the day of the week as integer and the day the week as object. 
  // Because recurrent events don't have the same dates of the the week we look for. So what matter is the day of week.
  // We already added day_of_week for this purpose in the db query
  let datesByDayOfweek = {};
  openingsByDay.forEach((_, date) => {
    datesByDayOfweek[date.getDay()] = date ;
  });

  // we should contruct all our avaiblaes slot in one loop

  if (events.length) {
    let currentDayKey, currentEventSlots;
    let openings = [];
    events.forEach(
      (event) => {
        // The main intersting key binding here is the day of the week 
        // if the event is an opening or appointment for this week, the date is OK 
        // if the 
        currentDayKey = datesByDayOfweek[event.day_of_week];
        currentEventSlots = getEventSlots(event);
        openings = openingsByDay.get(currentDayKey);
        // in opening , we add to already added slots
        if (event.kind === "opening") {
          openings = openings.concat(currentEventSlots);
        }
        // if appointments, we retrieve them from already found
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
 * Return a Map (dict), keys are the days in 'yyyy-MM-dd' format 
 * @param {Map} openeingByDay - Map with data as objects 
 * @returns {Object} - Object with keys as strings (days of the week ) + opening slots 
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
 * Get Availabilities
 * 1 - Get Events from DB 
 * 2 - Find Slots in events 
 * 3 - Format results
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
