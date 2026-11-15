// The Scrapbook: one page for every big piece of the base, to look back at between missions.
//
// Each page has two write-ups of the same science: `easy` (about ages 7 to 9: short sentences,
// everyday words) and `deep` (about ages 10 to 13: the real terms and numbers). Paragraphs are
// plain text. `fact` is the "Did you know?" note, `game` says what the thing does in this game,
// `words` are the science words used in `deep`, and `links` are real NASA pages to read next
// (`for` says who the page is written for).
//
// Pictures: `shot` names a still taken live from the 3D world (see `snapshot` in main.js),
// `model` is our Blender model (assets/blender/preview_scrapbook.py renders these) and `real` is
// a NASA photograph (`tall` marks an upright one, which is shown narrower). All the files are in
// public/scrapbook/.
//
// How a page is collected:
//   - `needs`: a Research Tree id. The page stays locked until that is researched.
//   - `found(sim)`: true once the player has met the thing in a mission. ui.js checks this
//     while a mission runs and keeps the ids in save.found.
// `hint` tells the player how to collect it. Reading a page for the first time pays
// CONFIG.science.pageRP research points (ids kept in save.read).
//
// Pages are for whole machines, not for upgrades: sun-tracking belongs on the Solar panels page.
// `upgrades` lists the Research Tree ids that improve the machine, and the page names them.
//
// Every fact here was checked against the NASA page it links to (2026-11-14). Check again
// before changing a number.

const NASA = 'https://www.nasa.gov';
const KIDS = `${NASA}/learning-resources/for-kids-and-students`;

export const CHAPTERS = [
  { id: 'home', name: 'Home on the Moon' },
  { id: 'power', name: 'Power and radio' },
  { id: 'outside', name: 'Going outside' },
  { id: 'safe', name: 'Staying safe' },
];

export const PAGES = [
  // ---- Home on the Moon ----
  {
    id: 'habitat', chapter: 'home', name: 'The Habitat', icon: 'home',
    found: () => true,
    hint: 'Start any mission.',
    shot: 'Habitat',
    shotCaption: 'Your Habitat at Connecting Ridge, with the airlock steps on the right.',
    model: { src: 'model-Habitat.jpg', alt: 'A 3D model of the Habitat with its roof cut away, showing the stations inside.', caption: 'Our 3D model with the roof off.' },
    real: {
      src: 'real-habitat.jpg', credit: 'NASA/Kim Shiflett', tall: true,
      alt: 'An astronaut in a blue flight suit crawls through a round hatch inside a white habitat test model.',
      caption: 'NASA astronaut Raja Chari climbs through a hatch in a full-size habitat test model at Kennedy Space Center, 2019.',
    },
    easy: [
      'The Habitat is your home on the Moon. The Moon has no air to breathe, so the Habitat is built like a giant sealed bottle that keeps the air in.',
      'Its walls also keep you warm. On the Moon the ground can be hotter than boiling water in the daytime and far colder than a freezer at night.',
      'Everything you need is inside: air, water, food, a bed and a radio to call Earth.',
    ],
    deep: [
      'A habitat is a pressure vessel: a strong shell that holds air at a pressure people can live in. The Moon has almost no atmosphere, so outside the shell there is nothing to breathe and no air pressure to keep a body working.',
      'The shell also has to manage heat. Near the Moon\'s equator the surface swings from about 120 °C in sunlight to about -130 °C at night. With no air to carry heat away, a habitat relies on insulation, heaters and radiators, which are panels that shed spare heat into space.',
      'People already live this way. Crews have lived on the International Space Station without a break since November 2000. Before anything new flies, NASA builds full-size test models on the ground, like the one in the photo, so astronauts can try the layout and say what needs to change.',
    ],
    fact: 'The Space Station has more room to live and work in than a six-bedroom house.',
    game: 'You walk around inside it. Seven stations along the walls run the whole base, with the airlock at one end and the Storm Shelter at the other.',
    words: [['Pressure vessel', 'a strong container that holds gas at a higher pressure than outside'], ['Radiator', 'a panel that gets rid of spare heat']],
    links: [
      { title: 'What Is the International Space Station? (Grades K-4)', url: `${KIDS}/what-is-the-international-space-station-grades-k-4/`, for: 'easy' },
      { title: 'What Is the International Space Station? (Grades 5-8)', url: `${KIDS}/what-is-the-international-space-station-grades-5-8/`, for: 'deep' },
      { title: 'Lunar Living: NASA\'s Artemis Base Camp Concept', url: `${NASA}/blogs/missions/2020/10/28/lunar-living-nasas-artemis-base-camp-concept/`, for: 'deep' },
    ],
  },
  {
    id: 'lifesupport', chapter: 'home', name: 'Life Support', icon: 'wind',
    found: sim => !!sim.flags.open_LifeSupport,
    hint: 'Open the Life Support station in the Habitat.',
    shot: 'LifeSupport',
    shotCaption: 'The Life Support station inside your Habitat.',
    real: {
      src: 'real-lifesupport.jpg', credit: 'NASA',
      alt: 'An astronaut floats beside an open equipment rack on the Space Station, working on machinery inside it.',
      caption: 'NASA astronaut Dan Burbank works on the Space Station machine that recycles urine into clean water, 2011.',
    },
    easy: [
      'You breathe in oxygen and breathe out a gas called carbon dioxide. In a sealed home, the good air would soon run out.',
      'The Life Support machine fixes that. It takes the carbon dioxide out of the air and puts fresh oxygen in.',
      'It cleans water too. On the Space Station, astronauts\' sweat, breath and even pee are cleaned and turned back into drinking water.',
    ],
    deep: [
      'Life support keeps the air and water in a sealed habitat safe. NASA calls it ECLSS, the Environmental Control and Life Support System.',
      'Air: each astronaut uses about 0.8 kg of oxygen a day and breathes out carbon dioxide, which is harmful if it builds up. On the Space Station, scrubbers trap the carbon dioxide, and an oxygen generator passes electricity through water to split it into hydrogen and oxygen. That is called electrolysis.',
      'Water: each crew member needs about a gallon (3.8 litres) a day for drinking, food and washing. Launching that much for ever would cost far too much, so the station collects the moisture from breath and sweat out of the cabin air and distils urine. In 2023 NASA reported that the station now recovers 98% of its water.',
      'The Moon is about 1,000 times farther from Earth than the Space Station is, so recycling matters even more there.',
    ],
    fact: 'On the Space Station, yesterday\'s pee becomes tomorrow\'s drinking water. NASA says it comes out cleaner than the water we drink on Earth.',
    game: 'Pick Eco, Normal or Boost at the Life Support station. A harder-working machine makes more air, and uses more power.',
    words: [['ECLSS', 'Environmental Control and Life Support System'], ['Electrolysis', 'using electricity to split water into hydrogen and oxygen'], ['Scrubber', 'a machine that removes carbon dioxide from air']],
    links: [
      { title: 'NASA Achieves Water Recovery Milestone on International Space Station', url: `${NASA}/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/`, for: 'both' },
      { title: 'Environmental Control and Life Support Systems (ECLSS)', url: `${NASA}/reference/environmental-control-and-life-support-systems-eclss/`, for: 'deep' },
    ],
    upgrades: ['Scrubber', 'Sabatier'],
  },
  {
    id: 'oxygen', chapter: 'home', name: 'Oxygen maker', icon: 'flask',
    found: sim => sim.ls === 'boost',
    hint: 'Set Life Support to Boost.',
    shot: 'OxygenMaker',
    shotCaption: 'The oxygen maker outside your base: a hopper for moon dirt, a furnace and a tank.',
    model: { src: 'model-OxygenMaker.jpg', alt: 'A 3D model of the oxygen maker: a yellow hopper, a white furnace and a round blue tank on a platform.', caption: 'Our 3D model.' },
    real: {
      src: 'real-oxygen.jpg', credit: 'NASA/Brian Sacco',
      alt: 'A look through the round door of a large vacuum chamber, with a small reactor and a laser on a stand inside.',
      caption: 'Inside the vacuum chamber at NASA\'s Johnson Space Center where a laser melted simulated moon dirt to release oxygen, 2023.',
    },
    easy: [
      'Moon dirt has a secret: almost half of it is oxygen! But the oxygen is locked up inside the rock, so you can\'t breathe it yet.',
      'The oxygen maker heats the dirt until it is so hot that the oxygen lets go. Then the machine catches the gas and stores it in the blue tank.',
      'Making air from the ground means fewer rockets have to carry it all the way from Earth.',
    ],
    deep: [
      'Lunar regolith (moon dirt) is about 45% oxygen by weight. The oxygen atoms are bonded to silicon, iron and other elements in the minerals, so pulling them free takes a lot of energy.',
      'In 2023 a NASA team at Johnson Space Center melted simulated moon dirt with a powerful laser inside a vacuum chamber, and measured the carbon monoxide gas that came off. It was the first time oxygen had been drawn out of lunar soil simulant in a vacuum, as it would have to be on the Moon. The method is called carbothermal reduction. Another method melts the dirt and passes electricity through it.',
      'Using what you find where you land is called in-situ resource utilization, or ISRU. Oxygen is the big prize. Astronauts breathe it, and it also makes up most of the weight of rocket propellant.',
    ],
    fact: 'Scientists practise on "simulant": pretend moon dirt made from crushed Earth rock. Real Moon samples are far too precious to melt.',
    game: 'Set Life Support to Boost and this machine turns moon dirt into extra oxygen. Your robot has to dig the dirt first.',
    words: [['Regolith', 'the layer of dust and broken rock that covers the Moon'], ['ISRU', 'in-situ resource utilization: making what you need from local materials'], ['Simulant', 'a material made on Earth to copy moon dirt']],
    links: [
      { title: 'NASA Successfully Extracts Oxygen from Lunar Soil Simulant', url: `${NASA}/centers-and-facilities/johnson/nasa-successfully-extracts-oxygen-from-lunar-soil-simulant/`, for: 'both' },
      { title: 'Overview: In-Situ Resource Utilization', url: `${NASA}/overview-in-situ-resource-utilization/`, for: 'deep' },
    ],
    upgrades: ['RegolithOxygen'],
  },
  {
    id: 'greenhouse', chapter: 'home', name: 'Greenhouse', icon: 'leaf',
    needs: 'Greenhouse',
    hint: 'Research the Greenhouse in the Research Tree.',
    shot: 'Food',
    shotCaption: 'The Galley in your Habitat, where the greenhouse grows.',
    real: {
      src: 'real-greenhouse.jpg', credit: 'NASA',
      alt: 'An astronaut in a green shirt holds a tray of red lettuce leaves on the Space Station.',
      caption: 'NASA astronaut Shane Kimbrough harvests red romaine lettuce grown on the Space Station, 2016.',
    },
    easy: [
      'Plants are the best roommates in space. They make food to eat and fresh oxygen to breathe.',
      'A plant needs light, water and carbon dioxide, which is the gas you breathe out. On the Moon the light comes from lamps, and the water comes from ice dug out of dark craters.',
      'Astronauts on the Space Station have grown lettuce, and then they ate it!',
    ],
    deep: [
      'Plants make their own food by photosynthesis: they use the energy in light to turn water and carbon dioxide into sugar, and they give off oxygen. In a habitat that is a double win, because the crew breathes out carbon dioxide and needs oxygen.',
      'NASA\'s Veggie garden has grown plants on the Space Station since 2014. The seeds sit in small "pillows" of clay and fertiliser instead of soil, and LED lamps give mostly red and blue light, the colours plants use best. Astronauts first ate space-grown red romaine lettuce in August 2015.',
      'A Moon greenhouse has to share. Lamps need power and plants need water, and at night both are in short supply. In 2022, scientists working with NASA grew small plants in real Moon soil brought back by Apollo crews. The plants sprouted but grew slowly, so farming in moon dirt needs more science first.',
    ],
    fact: 'Fresh food is good for the mind as well as the body. Astronauts say looking after plants makes the station feel more like home.',
    game: 'Turn on the grow lights at the Galley. With power and water the greenhouse grows meals, and the plants add a little oxygen.',
    words: [['Photosynthesis', 'how plants use light to make food from water and carbon dioxide'], ['LED', 'a lamp that makes light with very little electricity']],
    links: [
      { title: 'Growing Plants in Space', url: `${NASA}/exploration-research-and-technology/growing-plants-in-space/`, for: 'both' },
      { title: 'VEGGIE', url: 'https://science.nasa.gov/mission/veggie/', for: 'deep' },
      { title: 'Scientists Grow Plants in Lunar Soil', url: `${NASA}/humans-in-space/scientists-grow-plants-in-lunar-soil/`, for: 'deep' },
    ],
    upgrades: ['GrowLights', 'WaterRecycling'],
  },

  // ---- Power and radio ----
  {
    id: 'solar', chapter: 'power', name: 'Solar panels', icon: 'sun',
    found: sim => !!sim.flags.open_Power,
    hint: 'Open the Power station in the Habitat.',
    shot: 'Solar',
    shotCaption: 'One of your three solar panels, standing tall to catch the low Sun.',
    model: { src: 'model-Solar.jpg', alt: 'A 3D model of a solar panel: a tall grid of blue cells in a yellow frame on a thin mast.', caption: 'Our 3D model.' },
    real: {
      src: 'real-solar.jpg', credit: 'NASA', tall: true,
      alt: 'Long solar arrays on the Space Station with Earth below. A smaller, darker array is unrolled in front of an older one.',
      caption: 'A new roll-out solar array (the darker panel in front) opened on the Space Station in June 2021.',
    },
    easy: [
      'Solar panels turn sunlight into electricity. No smoke, no noise and no fuel. Light goes in and power comes out.',
      'They only work while the Sun shines on them. When night comes, they make nothing at all.',
      'At the Moon\'s south pole the Sun never climbs high. It rolls around the edge of the sky, so your panels stand up tall to catch it.',
    ],
    deep: [
      'A solar panel is made of solar cells, thin slices of a material such as silicon. When light hits a cell it knocks electrons loose, and those moving electrons are an electric current. Scientists call this the photovoltaic effect.',
      'The Moon turns slowly. One lunar day lasts about 29.5 Earth days, so most places get about two weeks of sunlight and then two weeks of darkness. The south pole is different. The Moon is tilted only about 1.5 degrees, so near the pole the Sun circles low around the horizon and some high ridges are sunlit most of the time. That is why your base sits on Connecting Ridge.',
      'A low Sun makes long shadows, so a panel lying flat on the ground would often be in the dark. NASA is working with three companies on upright panels that rise about 10 metres (32 feet) on a mast. The project is called Vertical Solar Array Technology, or VSAT.',
    ],
    fact: 'The Space Station runs on about an acre of solar panels. That is most of a football field.',
    game: 'Three panels charge the battery in daylight. A space rock can break one, and then you or the robot must fix it.',
    words: [['Solar cell', 'the part of a panel that turns light into electricity'], ['Photovoltaic effect', 'light knocking electrons loose to make an electric current'], ['Horizon', 'the line where the ground meets the sky']],
    links: [
      { title: 'Where Does the Sun\'s Energy Come From? (NASA Space Place)', url: 'https://spaceplace.nasa.gov/sun-heat/en/', for: 'easy' },
      { title: 'Three Companies to Help NASA Advance Solar Array Technology for Moon', url: `${NASA}/news-release/three-companies-to-help-nasa-advance-solar-array-technology-for-moon/`, for: 'deep' },
      { title: 'New Solar Arrays to Power NASA\'s International Space Station Research', url: `${NASA}/missions/station/new-solar-arrays-to-power-nasas-international-space-station-research/`, for: 'deep' },
    ],
    upgrades: ['SunTracking'],
  },
  {
    id: 'battery', chapter: 'power', name: 'Battery', icon: 'battery',
    found: sim => !!sim.flags.night,
    hint: 'Keep your base running after the Sun sets.',
    shot: 'Battery',
    shotCaption: 'The battery pack outside your base.',
    model: { src: 'model-Battery.jpg', alt: 'A 3D model of the battery: three yellow cells with blue fins and a charge display on a platform.', caption: 'Our 3D model.' },
    real: {
      src: 'real-battery.jpg', credit: 'NASA',
      alt: 'An astronaut in a white spacesuit works on the outside of the Space Station with Earth\'s blue edge behind.',
      caption: 'NASA astronaut Chris Cassidy fits new lithium-ion batteries to the Space Station during a spacewalk, July 2020.',
    },
    easy: [
      'A battery is like a lunch box for electricity. The solar panels fill it up in the daytime, and the base eats from it at night.',
      'If the battery runs out before sunrise, the lights dim, the heaters slow down and the air machine gets weak.',
      'That is why you switch off the things you don\'t need when it gets dark.',
    ],
    deep: [
      'Solar panels stop at sunset, but a base needs power all night, mostly for heat and air. A battery stores energy in chemicals and turns it back into electricity when it is needed.',
      'The Space Station does this about 16 times a day. It circles Earth roughly every 90 minutes and spends about a third of each lap in Earth\'s shadow, running on batteries. Between 2017 and 2021, spacewalkers swapped its old nickel-hydrogen batteries for lithium-ion ones. Those are the same family as the battery in a phone, and they hold much more energy for their weight.',
      'The Moon is harder. Away from the poles, night lasts about 14 Earth days, and batteries big enough for that would be very heavy. So NASA is testing regenerative fuel cells. In daylight, solar power splits water into hydrogen and oxygen. At night the two gases join back into water and give out electricity.',
    ],
    fact: 'Cold is a battery\'s enemy. On the Moon, some of a battery\'s own energy goes on keeping the battery warm.',
    game: 'The Power meter is your battery. At night it alone keeps the heaters, air and radio running, so choose Eco and switch off the extras.',
    words: [['Lithium-ion', 'a light kind of rechargeable battery'], ['Fuel cell', 'a device that makes electricity by joining hydrogen and oxygen into water']],
    links: [
      { title: 'NASA Fuel Cell Tests Pave Way for Energy Storage on Moon', url: `${NASA}/general/nasa-regenerative-fuel-cell-testing/`, for: 'both' },
      { title: 'Lunar Surface Technology', url: `${NASA}/lunar-surface-technology/`, for: 'deep' },
    ],
    upgrades: ['HeatBlankets'],
  },
  {
    id: 'antenna', chapter: 'power', name: 'Antenna', icon: 'radio',
    found: sim => !!sim.flags.open_Comms,
    hint: 'Open the Comms station in the Habitat.',
    shot: 'Antenna',
    shotCaption: 'Your dish antenna, pointed at Earth.',
    model: { src: 'model-Antenna.jpg', alt: 'A 3D model of the antenna: a round blue dish on a white tripod.', caption: 'Our 3D model.' },
    real: {
      src: 'real-antenna.jpg', credit: 'NASA/JPL-Caltech',
      alt: 'A giant white dish antenna in a desert under a bright Sun, with a second dish in the distance.',
      caption: 'Dish antennas at NASA\'s Deep Space Network site in Goldstone, California, 2020.',
    },
    easy: [
      'The antenna is how you talk to Earth. It sends your words as radio waves, which are a kind of light you cannot see.',
      'Nothing is faster than radio waves, but the Moon is far away. A message still takes more than one second to reach Earth.',
      'The dish works like cupped hands around your mouth. It points the signal straight at Earth.',
    ],
    deep: [
      'Radio waves travel at the speed of light, about 300,000 km every second. The Moon is about 384,400 km away, so a message needs about 1.3 seconds to cross, and the answer needs 1.3 more. On Mars the wait is 3 to 22 minutes each way.',
      'A dish antenna is a curved mirror for radio. It gathers a weak signal onto one point, or sends a signal out as a narrow beam. On Earth, NASA listens with the Deep Space Network: giant dishes, the largest 70 metres across, at three sites in California, Spain and Australia. They are spread around the globe so that as Earth turns, at least one site can always hear a spacecraft.',
      'From the Moon\'s south pole, Earth sits low on the horizon and sometimes slips behind the hills, which cuts the link. NASA is planning relay satellites around the Moon to fill the gaps, as part of a network called LunaNet.',
    ],
    fact: 'The Voyager 1 spacecraft is now so far away that its radio signal takes about a whole day to reach the Deep Space Network.',
    game: 'Switch the antenna on at the Comms or Power station. With it on, and Earth above the horizon, Mission Control can warn you before a solar storm.',
    words: [['Radio wave', 'a kind of light with a very long wavelength, used to send signals'], ['Relay', 'a satellite that passes a signal on'], ['Horizon', 'the line where the ground meets the sky']],
    links: [
      { title: 'How Does NASA Communicate with Spacecraft in Deep Space? (NASA Space Place)', url: 'https://spaceplace.nasa.gov/dsn-antennas/en/', for: 'easy' },
      { title: 'Deep Space Network', url: `${NASA}/communicating-with-missions/dsn/`, for: 'deep' },
      { title: 'LunaNet', url: `${NASA}/communicating-with-missions/lunanet/`, for: 'deep' },
    ],
    upgrades: ['DishAntenna'],
  },

  // ---- Going outside ----
  {
    id: 'airlock', chapter: 'outside', name: 'Airlock', icon: 'door',
    found: sim => !!sim.flags.open_Airlock || sim.airlock.uses > 0,
    hint: 'Open the Airlock station in the Habitat.',
    shot: 'Airlock',
    shotCaption: 'The outer hatch of your airlock, at the top of the yellow steps.',
    model: { src: 'model-Airlock.jpg', alt: 'A 3D model of the end of the Habitat: an open white hatch above a landing with yellow rails.', caption: 'Our 3D model of the hatch.' },
    real: {
      src: 'real-airlock.jpg', credit: 'NASA',
      alt: 'The outside of the Space Station seen from above: round modules, and an astronaut in a white suit beside an open hatch.',
      caption: 'NASA astronaut Nick Hague, just outside the Space Station\'s Quest airlock at the start of a spacewalk, January 2025.',
    },
    easy: [
      'An airlock is a tiny room with two doors. It lets you go outside without letting your air escape.',
      'The trick is that the two doors are never open at the same time. You step in, the inside door shuts, the air is pumped away, and only then does the outside door open.',
      'Coming home, it all happens backwards.',
    ],
    deep: [
      'If you opened a habitat door straight onto the Moon, the air would rush out into the vacuum. An airlock stops that. Pumps pull most of the air in the small room back into the habitat before the outer hatch opens, so only a little is lost on each trip.',
      'On the Space Station, spacewalks in American suits begin in the Quest airlock, which was added in July 2001.',
      'There is a hidden danger. Cabin air is at about the same pressure as air at sea level, but a spacesuit is kept at a much lower pressure so that its joints can bend. A fast drop in pressure can make nitrogen dissolved in the blood form bubbles, like the fizz when you open a bottle of soda. Divers call the illness "the bends". So astronauts first breathe pure oxygen to flush the nitrogen out. This is called a prebreathe, and the real thing takes hours.',
    ],
    fact: 'The Apollo Moon landers had no airlock. The astronauts let the air out of the whole cabin every time they opened the door.',
    game: 'Use the Airlock station to suit up. Each trip out costs a little Life Support, because the pumps cannot save all the air.',
    words: [['Vacuum', 'space with no air in it'], ['Pressure', 'how hard a gas pushes on everything around it'], ['Prebreathe', 'breathing pure oxygen before a spacewalk']],
    links: [
      { title: 'What Is a Spacewalk? (Grades K-4)', url: `${KIDS}/what-is-a-spacewalk-grades-k-4/`, for: 'easy' },
      { title: 'What Is a Spacewalk? (Grades 5-8)', url: `${KIDS}/what-is-a-spacewalk-grades-5-8/`, for: 'deep' },
      { title: 'Quest Airlock', url: `${NASA}/international-space-station/quest-airlock/`, for: 'deep' },
    ],
  },
  {
    id: 'suit', chapter: 'outside', name: 'Spacesuit', icon: 'helmet',
    found: sim => sim.where === 'outside',
    hint: 'Go on a moonwalk.',
    shot: 'Crew',
    shotCaption: 'You, suited up for a moonwalk.',
    model: { src: 'model-Astronaut.jpg', alt: 'A 3D model of the astronaut in a white spacesuit with a gold visor and a backpack.', caption: 'Our 3D model.' },
    real: {
      src: 'real-suit.jpg', credit: 'NASA',
      alt: 'An astronaut in a bulky white spacesuit stands on the grey Moon. The photographer is reflected in the gold visor.',
      caption: 'Buzz Aldrin on the Moon during Apollo 11, July 1969. Neil Armstrong, who took the picture, is reflected in the visor.',
    },
    easy: [
      'A spacesuit is a tiny spaceship shaped like a person. It carries everything that keeps you alive outside.',
      'The backpack holds oxygen to breathe. Under the suit you wear long underwear with thin tubes of cool water running through it, so you don\'t get too hot.',
      'The suit only holds so much air. When it runs low, it is time to head back to the airlock.',
    ],
    deep: [
      'Outside the Habitat there is no air and no air pressure, and the temperature can swing from far above boiling in sunlight to far below freezing in shadow. A spacesuit carries its own small atmosphere and keeps its wearer at a safe temperature.',
      'It is built in layers. Next to the skin is a garment laced with tubes of cooling water. Then comes an airtight bladder that holds oxygen at pressure, and a layer that keeps the bladder in shape. On the outside are many layers of insulation and tough fabric, which stop tiny, fast space rocks called micrometeoroids. The backpack is the Portable Life Support System. It supplies oxygen, removes carbon dioxide and runs the cooling and the radio. The visor has a thin coating of gold that reflects the Sun\'s harsh rays.',
      'An Apollo Moon suit with its backpack weighed about 82 kg (180 pounds) on Earth. On the Moon, where gravity is one-sixth as strong, it felt like about 14 kg.',
    ],
    fact: 'The gold on a spacesuit visor is real gold. The layer is so thin that you can see through it.',
    game: 'Your suit carries its own air tank, shown as the Suit air meter. Your radiation dose also climbs faster outside. Plan your moonwalk, then get back in.',
    words: [['Micrometeoroid', 'a tiny, very fast grain of space rock'], ['Portable Life Support System', 'the backpack that supplies air and cooling']],
    links: [
      { title: 'What Is a Spacesuit? (Grades K-4)', url: `${KIDS}/what-is-a-spacesuit-grades-k-4/`, for: 'easy' },
      { title: 'What Is a Spacesuit? (Grades 5-8)', url: `${KIDS}/what-is-a-spacesuit-grades-5-8/`, for: 'deep' },
      { title: 'Spacesuits', url: `${NASA}/humans-in-space/spacesuits/`, for: 'deep' },
    ],
    upgrades: ['SuitTank'],
  },
  {
    id: 'robot', chapter: 'outside', name: 'Robot digger', icon: 'rover',
    found: sim => !!sim.flags.open_MapTable,
    hint: 'Open the Robot Map in the Habitat.',
    shot: 'Digger',
    shotCaption: 'Your robot, parked at the base.',
    model: { src: 'model-Digger.jpg', alt: 'A 3D model of the robot: a small four-wheeled rover with two camera eyes and a red digging drum at each end.', caption: 'Our 3D model.' },
    real: {
      src: 'real-robot.jpg', credit: 'NASA/Frank Michaux',
      alt: 'A small robot with a spinning drum at each end throws up dust on top of a mound of grey soil in a test hall.',
      caption: 'NASA\'s RASSOR robot digs simulated moon dirt with its spinning bucket drums at Kennedy Space Center, June 2025.',
    },
    easy: [
      'Your robot does the dusty jobs outside so that you can stay safe inside. It digs moon dirt, hauls ice and fixes panels.',
      'Digging on the Moon is tricky. Things weigh six times less there, so a light robot that pushes into the ground can push itself backwards instead!',
      'NASA\'s robot digger has scoops that spin in opposite directions. The two pushes cancel out, and the robot stays put.',
    ],
    deep: [
      'Robots are a good choice for work that is dull, dirty or dangerous. On the Moon a robot can work outside for hours without needing air, and nobody takes a radiation dose while it does.',
      'Digging in low gravity is a real engineering problem. On Earth, a digger\'s own weight presses it onto the ground and gives it grip. On the Moon everything weighs one-sixth as much, so the same machine slips. NASA\'s RASSOR (Regolith Advanced Surface Systems Operations Robot) has two bucket drums, one at each end, that spin in opposite directions. The force from one drum cancels the force from the other, so the robot hardly needs to push at all.',
      'Moon dust is a second problem. With no wind or water to wear them smooth, the grains stay as sharp as tiny pieces of broken glass. They cling to everything and grind away at seals and wheels, so lunar robots need tough, well-sealed joints.',
    ],
    fact: 'RASSOR is said out loud as "razor".',
    game: 'Send it out from the Robot Map. It uses power while it works, and it must be parked before a solar storm or the storm can knock it out.',
    words: [['Gravity', 'the pull that gives things weight'], ['Regolith', 'the layer of dust and broken rock that covers the Moon']],
    links: [
      { title: 'What Is Robotics? (Grades K-4)', url: `${KIDS}/what-is-robotics-grades-k-4/`, for: 'easy' },
      { title: 'What Is Robotics? (Grades 5-8)', url: `${KIDS}/what-is-robotics-grades-5-8/`, for: 'deep' },
      { title: 'Infrastructure Pilot Excavator (NASA\'s next Moon digger)', url: `${NASA}/infrastructure-pilot-excavator/`, for: 'deep' },
    ],
    upgrades: ['DrumDigger'],
  },
  {
    id: 'icedrill', chapter: 'outside', name: 'Ice drill', icon: 'drill',
    found: sim => sim.robot.task === 'ice',
    hint: 'In the Ice and Greens mission, send the robot to haul crater ice.',
    shot: 'IceDrill',
    shotCaption: 'The ice drill, set up on ground that never sees the Sun.',
    model: { src: 'model-IceDrill.jpg', alt: 'A 3D model of the ice drill: a tall white tower with a blue drill bit, on a platform with a yellow tank.', caption: 'Our 3D model.' },
    real: {
      src: 'real-icedrill.jpg', credit: 'NASA/Robert Markowitz',
      alt: 'Three engineers in white clean-room suits and hair nets lean in to look at a long drill lying on a workbench.',
      caption: 'Engineers inspect NASA\'s TRIDENT ice drill at Johnson Space Center, 2023.',
    },
    easy: [
      'Near the Moon\'s south pole there are craters so deep that sunlight never reaches the bottom. They are some of the coldest places anyone has ever measured.',
      'Ice hides in that frozen ground. It may have been there for billions of years.',
      'A drill can dig the icy dirt out. Melt the ice and you have water to drink and to give to your plants.',
    ],
    deep: [
      'The Moon barely tilts, so the floors of some craters near the poles have not seen sunlight for billions of years. Scientists call them permanently shadowed regions. NASA\'s Lunar Reconnaissance Orbiter has measured temperatures near -240 °C in the coldest of them, which is colder than the surface of Pluto.',
      'Anything that drifts into such a cold trap freezes and stays there. In 2009, NASA\'s LCROSS mission crashed an empty rocket stage into one of these craters, and its instruments found grains of water ice in the cloud of debris thrown up.',
      'Ground that cold is as hard as rock. NASA\'s TRIDENT drill, built by Honeybee Robotics, spins and hammers at the same time to break through it, and can bring up soil from as deep as 1 metre. Water is worth the trouble. It can be drunk, given to plants, or split into oxygen to breathe and hydrogen for rocket fuel.',
    ],
    fact: 'The blue patches on your Robot Map are real. They come from NASA\'s map of ground that is always in shadow.',
    game: 'In the Ice and Greens mission, your robot drives to the nearest shadowed ground and hauls back ice to water the greenhouse.',
    words: [['Permanently shadowed region', 'ground that sunlight never reaches'], ['Cold trap', 'a place so cold that water vapour freezes onto it and stays']],
    links: [
      { title: 'Moon Water and Ices', url: 'https://science.nasa.gov/moon/moon-water-and-ices/', for: 'both' },
      { title: 'Polar Resources Ice Mining Experiment 1 (PRIME-1)', url: `${NASA}/mission/polar-resources-ice-mining-experiment-1-prime-1/`, for: 'deep' },
      { title: 'LCROSS', url: 'https://science.nasa.gov/mission/lcross/', for: 'deep' },
    ],
    upgrades: ['IceDrill'],
  },
  {
    id: 'lander', chapter: 'outside', name: 'Cargo lander', icon: 'lander',
    found: sim => !!sim.flags.open_Food,
    hint: 'Open the Galley in the Habitat. The lander brought your meals.',
    shot: 'CargoLander',
    shotCaption: 'The cargo lander that brought your supplies, with its ramp down.',
    model: { src: 'model-CargoLander.jpg', alt: 'A 3D model of the cargo lander: an eight-sided yellow deck on four legs, carrying boxes and a tank, with a ramp to the ground.', caption: 'Our 3D model.' },
    real: {
      src: 'real-lander.jpg', credit: 'NASA',
      alt: 'A gold and silver lander on four legs stands on the grey Moon under a black sky. An astronaut works at its side.',
      caption: 'The Apollo 11 lander, Eagle, on the Moon in July 1969. Buzz Aldrin is unloading science experiments.',
    },
    easy: [
      'The cargo lander is your delivery truck. It flew all the way from Earth with your food and supplies.',
      'The Moon has no air, so a parachute would not work. A lander slows down by firing its rocket engine toward the ground.',
      'Its bendy legs soak up the bump when it touches down.',
    ],
    deep: [
      'Everything a Moon base cannot make for itself has to be flown from Earth, about 384,400 km away. Apollo crews made the trip in about three days.',
      'Landing is the hard part. On Earth or Mars a spacecraft can use air to slow down, with a heat shield and parachutes. The Moon has no air, so a lander must carry enough propellant to brake all the way down on its engine while it steers to a flat, safe spot. Legs with crushable or springy parts take up the last bump.',
      'Today NASA buys rides on landers built by companies, through a programme called Commercial Lunar Payload Services (CLPS). In February 2024, Intuitive Machines\' lander Odysseus made the first American Moon landing since Apollo 17 in 1972. In March 2025, Firefly Aerospace\'s Blue Ghost landed with ten NASA science and technology experiments on board.',
    ],
    fact: 'The bottom half of every Apollo lander is still on the Moon. Each one was the launch pad for the trip home, and was left behind.',
    game: 'It delivered the meals you start with. In the Ice and Greens mission the next lander is late, so you have to grow your own food.',
    words: [['Propellant', 'the fuel, and the oxygen to burn it, that a rocket engine uses'], ['Payload', 'the cargo a spacecraft carries']],
    links: [
      { title: 'What Was the Apollo Program? (Grades K-4)', url: `${KIDS}/what-was-the-apollo-program-grades-k-4/`, for: 'easy' },
      { title: 'What Was the Apollo Program? (Grades 5-8)', url: `${KIDS}/what-was-the-apollo-program-grades-5-8/`, for: 'deep' },
      { title: 'Commercial Lunar Payload Services', url: `${NASA}/commercial-lunar-payload-services/`, for: 'deep' },
    ],
  },

  // ---- Staying safe ----
  {
    id: 'shelter', chapter: 'safe', name: 'Storm Shelter', icon: 'shield',
    found: sim => !!sim.flags.open_Shelter || sim.where === 'shelter',
    hint: 'Visit the Storm Shelter at the back of the Habitat.',
    shot: 'Shelter',
    shotCaption: 'The Storm Shelter at the back of your Habitat. The blue floor shows where you are protected.',
    real: {
      src: 'real-shelter.jpg', credit: 'NASA/SDO',
      alt: 'The whole Sun glowing blue-green, with a very bright flash on its lower left edge.',
      caption: 'The bright flash at the lower left is an X-class solar flare, seen by NASA\'s Solar Dynamics Observatory on October 19, 2014.',
    },
    easy: [
      'Sometimes the Sun burps. A giant flash called a solar flare can shoot out a storm of tiny, super-fast particles.',
      'On Earth, our air and our planet\'s magnetic field keep us safe. The Moon has neither, so the particles reach the ground.',
      'You can\'t see or feel them, but too many are bad for your body. So when a storm comes, you hide in the Storm Shelter, the spot with the most stuff between you and the sky.',
    ],
    deep: [
      'The Sun sometimes lets go of a burst of energy called a solar flare. Scientists grade the big ones C, M or X, and each letter is ten times stronger than the one before. A large flare can come with a solar particle event: a rush of protons moving at a good fraction of the speed of light. The flash reaches us in about 8 minutes, and the first particles can follow within tens of minutes.',
      'Earth\'s thick atmosphere and its magnetic field stop these particles. The Moon has no such protection. Particle radiation can damage the cells of the body, and a large dose raises the risk of illness, so NASA limits the total dose an astronaut may receive in a whole career to 600 millisieverts.',
      'The defence is mass. The more material there is between you and the storm, the fewer particles get through, and materials rich in hydrogen, such as water and plastic, work best for their weight. On NASA\'s Orion spacecraft, the crew\'s plan for a storm is to build a shelter in the middle of the cabin by stacking their supply bags around themselves.',
    ],
    fact: 'In August 1972 a huge solar storm struck between the Apollo 16 and Apollo 17 missions. Luckily, nobody was on the Moon.',
    game: 'The shelter is the back of the Habitat. During a storm your dose climbs far more slowly there than in the rest of the base, or outside.',
    words: [['Solar flare', 'a sudden burst of energy from the Sun'], ['Radiation', 'energy or fast particles that can pass into the body'], ['Proton', 'a tiny particle found in the centre of every atom']],
    links: [
      { title: 'What Is Space Weather? (NASA Space Place)', url: 'https://spaceplace.nasa.gov/spaceweather/en/', for: 'easy' },
      { title: 'Sunspots and Solar Flares (NASA Space Place)', url: 'https://spaceplace.nasa.gov/solar-activity/en/', for: 'easy' },
      { title: 'Why Space Radiation Matters', url: `${NASA}/missions/analog-field-testing/why-space-radiation-matters/`, for: 'deep' },
      { title: 'Scientists and Engineers Evaluate Orion Radiation Protection Plan', url: `${NASA}/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/`, for: 'deep' },
    ],
    upgrades: ['ParticleDetector', 'WaterWall'],
  },
  {
    id: 'shielding', chapter: 'safe', name: 'Regolith shielding', icon: 'layers',
    needs: 'Shielding',
    hint: 'Research Regolith Shielding in the Research Tree.',
    shot: 'HabitatBack',
    shotCaption: 'The shelter end of your Habitat, where the moon dirt is piled on.',
    real: {
      src: 'real-shielding.jpg', credit: 'NASA',
      alt: 'A sharp boot print with ridged treads pressed into fine grey Moon dust.',
      caption: 'A boot print in the Moon\'s regolith, made by Buzz Aldrin on Apollo 11, July 1969.',
    },
    easy: [
      'Regolith is the science word for moon dirt: the grey dust and broken rock that covers the whole Moon.',
      'It makes a great shield. When storm particles hit a thick pile of dirt, they crash into it and stop before they reach you.',
      'The best part? You don\'t have to bring it from Earth. It is already there, everywhere you look.',
    ],
    deep: [
      'Space rocks have been hitting the Moon for more than four billion years. The impacts smashed the surface into a blanket of dust and rubble called regolith, several metres deep in most places.',
      'A solar storm particle loses a little energy every time it bumps into an atom. Send it through enough atoms and it stops. So a thick layer of almost anything works as a shield, and on the Moon the cheapest "anything" is the regolith under your feet. Launching shielding from Earth would cost a fortune. Scooping it up costs only robot time and power.',
      'Engineers have studied piling loose regolith over a habitat, packing it into bags like sandbags, and melting it into solid walls. NASA is working with a company called ICON on 3D printers that could one day build landing pads and shelters out of moon dirt.',
      'Shielding has limits. It works well against solar storms, but the most energetic cosmic rays from deep space can pass through metres of rock.',
    ],
    fact: 'Moon dust smells like burnt gunpowder. Apollo astronauts noticed it when they carried the dust back into their lander on their suits.',
    game: 'Research this, then pile moon dirt on the Storm Shelter. Each level cuts the dose you take inside during a storm.',
    words: [['Regolith', 'the layer of dust and broken rock that covers the Moon'], ['Cosmic rays', 'very fast particles that come from far outside the solar system']],
    links: [
      { title: 'All About the Moon (NASA Space Place)', url: 'https://spaceplace.nasa.gov/all-about-the-moon/en/', for: 'easy' },
      { title: 'Moon Composition', url: 'https://science.nasa.gov/moon/composition/', for: 'deep' },
      { title: 'NASA Looks to Advance 3D Printing Construction Systems for the Moon and Mars', url: `${NASA}/centers-and-facilities/marshall/nasa-looks-to-advance-3d-printing-construction-systems-for-the-moon-and-mars/`, for: 'deep' },
    ],
  },
];

export const pageById = id => PAGES.find(page => page.id === id);
export const LEVELS = { easy: 'Easy read', deep: 'Deep dive' };

// Is this page in the book yet? `unlocks` is the Research Tree ids the player owns, `found` the
// page ids met in missions. `all` is the teacher and judge switch that opens everything.
export function pageOpen(page, { unlocks, found, all }) {
  if (all) return true;
  return page.needs ? unlocks.includes(page.needs) : found.includes(page.id);
}

// Pages the running mission has just met for the first time.
export function discover(sim, found) {
  return PAGES.filter(page => page.found && !found.includes(page.id) && page.found(sim));
}
