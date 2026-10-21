// Your Home Assistant: address, people, rooms and the entities the dashboard shows.
// Copy this file to config.js (it is ignored by git) and replace every id with yours:
// Home Assistant > Developer tools > States lists them. Remove what you do not have, the matching card hides itself.
window.HQ_CONFIG = {
  // people hidden when the page is opened with ?anon (screenshot mode)
  anonHide: [],
  // word removed from device names in screenshot mode
  anonStrip: '',
  // Address of Home Assistant, used when the dashboard is not served by Home Assistant itself
  defaultUrl: 'http://homeassistant.local:8123',
  people: [
    { id: 'alex', name: 'Alex', entity: 'person.alex', calendars: ['calendar.alex_work', 'calendar.alex_personal'], color: '#FF7A1A', rgb: '255 122 26', ink: '#111111' },
    { id: 'sam', name: 'Sam', entity: 'person.sam', calendars: ['calendar.sam'], color: '#2D5BFF', rgb: '45 91 255', ink: '#FFFFFF' }
  ],
  weather: 'weather.home',
  // Current outside temperature shown everywhere (the weather entity only gives the forecast and conditions)
  outdoor: 'sensor.outdoor_temperature',
  // Indoor temperature = average of these room sensors.
  indoor: ['sensor.living_room_temperature', 'sensor.bedroom_temperature'],
  uv: 'sensor.home_uv_index',
  aqi: 'sensor.home_air_quality_index',
  // Vélib' station (bikes available)
  velib: { ebike: 'sensor.velib_station_e_bike', mech: 'sensor.velib_station_mechanical', docks: 'sensor.velib_station_free_docks', name: 'My station' },
  energy: { month: 'sensor.linky_month_consumption', cost: 'sensor.linky_month_cost', day: 'sensor.daily_electricity',
    // monthly subscription (incl. taxes): added to the consumption cost to get the estimated bill of the month
    sub: 'sensor.linky_subscription' },
  rooms: [
    { id: 'salon', name: 'Salon', group: 'light.living_room', temp: 'sensor.living_room_temperature', lights: ['light.living_room', 'light.floor_lamp', 'light.tv_strip'] },
    { id: 'chambre', name: 'Chambre', group: 'light.bedroom', temp: 'sensor.bedroom_temperature', lights: ['light.bedroom', 'light.bedside_left', 'light.bedside_right'] },
    { id: 'cuisine', name: 'Cuisine', lights: ['light.kitchen_ceiling', 'light.kitchen_counter'] }
  ],
  scenes: [
    { entity: 'scene.living_room_bright', name: 'Salon lumineux', icon: 'sunrise' },
    { entity: 'scene.movie', name: 'Film', icon: 'film' },
    { entity: 'scene.living_room_night', name: 'Salon nuit', icon: 'moon' }
  ],
  climate: 'climate.living_room_trv',
  // Heating / cooling devices: radiator valves (kind 'trv') and an air conditioner (kind 'ac')
  climates: [
    { id: 'salon', name: 'Salon', entity: 'climate.living_room_trv', kind: 'trv' },
    { id: 'chambre', name: 'Chambre', entity: 'climate.bedroom_trv', kind: 'trv' },
    { id: 'clim', name: 'Clim', entity: 'climate.air_conditioner', kind: 'ac' }
  ],
  // Machines shown as pills (bottom of the home screen / standby) and on the full-screen "Électroménager" page.
  // Order = priority when more than three run at once. `kind` picks the drawing and the steps:
  // oven, washer (LocalThings / SmartThings-style entities), dish and coffee (Home Connect entities).
  machines: [
    { id: 'four', kind: 'oven', name: 'Four', e: {
      state: 'sensor.oven_machine_state', temp: 'sensor.oven_temperature', setpoint: 'number.oven_setpoint', pct: 'sensor.oven_progress_percent',
      finish: 'sensor.oven_estimated_finish', door: 'binary_sensor.oven_door', mode: 'select.oven_cooking_mode' } },
    { id: 'linge', kind: 'washer', name: 'Lave-linge', e: {
      running: 'binary_sensor.washer_running', state: 'sensor.washer_machine_state', phase: 'sensor.washer_progress', pct: 'sensor.washer_progress_percent',
      remaining: 'sensor.washer_completion_time', finish: 'sensor.washer_estimated_finish',
      spin: 'select.washer_spin_speed', rinses: 'select.washer_rinse_cycles', temp: 'select.washer_wash_temperature',
      cycle: 'select.washer_cycle', prewash: 'switch.washer_pre_wash' } },
    { id: 'vaisselle', kind: 'dish', name: 'Lave-vaisselle', e: {
      state: 'sensor.dishwasher_operation_state', phase: 'sensor.dishwasher_program_phase', pct: 'sensor.dishwasher_program_progress',
      remaining: 'sensor.dishwasher_remaining_program_time', program: 'sensor.dishwasher_active_program', door: 'binary_sensor.dishwasher_door',
      salt: 'sensor.dishwasher_salt', rinse: 'sensor.dishwasher_rinse_aid' } },
    { id: 'cafe', kind: 'coffee', name: 'Machine à café', e: {
      state: 'sensor.coffee_maker_operation_state', program: 'sensor.coffee_maker_active_program', pct: 'sensor.coffee_maker_program_progress',
      tray: 'sensor.coffee_maker_drip_tray', beans: 'binary_sensor.coffee_maker_bean_container_empty' } }
  ],
  // Things that need attention (amber pills)
  alerts: { dishSalt: 'sensor.dishwasher_salt', dishRinse: 'sensor.dishwasher_rinse_aid', coffeeTray: 'sensor.coffee_maker_drip_tray', coffeeBeans: 'binary_sensor.coffee_maker_bean_container_empty' },
  media: ['media_player.living_room', 'media_player.kitchen'],
  // Room shown for each speaker
  mediaRooms: { 'media_player.living_room': 'Salon', 'media_player.kitchen': 'Cuisine' },
  // Pollen sensors: [{ entity: 'sensor.…', name: 'Bouleau' }]. The air card shows a pollen line only when one of them reports something.
  pollen: [],
  vacuum: 'vacuum.robot',
  sun: 'sun.sun',
  alert: 'sensor.weather_alert',   // Météo-France: state = highest colour, attributes = one colour per phenomenon
  // Motion sensors that wake the frame from standby when someone passes (the frame has no presence sensor, only light).
  wake: ['binary_sensor.hallway_motion']
};
