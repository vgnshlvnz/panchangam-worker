// Bilingual name tables: [Tamil script, English transliteration of the Tamil name].
// Index order is the classical order (0-based).

export const TITHI = [
  ["பிரதமை", "Prathamai"], ["துவிதியை", "Dvitiyai"], ["திருதியை", "Tritiyai"], ["சதுர்த்தி", "Chathurthi"],
  ["பஞ்சமி", "Panchami"], ["சஷ்டி", "Shashti"], ["சப்தமி", "Sapthami"], ["அஷ்டமி", "Ashtami"],
  ["நவமி", "Navami"], ["தசமி", "Dasami"], ["ஏகாதசி", "Ekadasi"], ["துவாதசி", "Dvadasi"],
  ["திரயோதசி", "Thrayodasi"], ["சதுர்த்தசி", "Chathurdasi"], ["பௌர்ணமி", "Pournami"],
];
export const AMAVASAI = ["அமாவாசை", "Amavasai"];
export const PAKSHA = { shukla: ["வளர்பிறை", "Valarpirai"], krishna: ["தேய்பிறை", "Theipirai"] };

export const NAKSHATRA = [
  ["அசுவினி", "Aswini"], ["பரணி", "Barani"], ["கார்த்திகை", "Karthigai"], ["ரோகிணி", "Rohini"],
  ["மிருகசீரிடம்", "Mirugasirisham"], ["திருவாதிரை", "Thiruvathirai"], ["புனர்பூசம்", "Punarpoosam"],
  ["பூசம்", "Poosam"], ["ஆயில்யம்", "Ayilyam"], ["மகம்", "Magam"], ["பூரம்", "Pooram"],
  ["உத்திரம்", "Uthiram"], ["அஸ்தம்", "Hastham"], ["சித்திரை", "Chithirai"], ["சுவாதி", "Swathi"],
  ["விசாகம்", "Visakam"], ["அனுஷம்", "Anusham"], ["கேட்டை", "Kettai"], ["மூலம்", "Moolam"],
  ["பூராடம்", "Pooradam"], ["உத்திராடம்", "Uthiradam"], ["திருவோணம்", "Thiruvonam"],
  ["அவிட்டம்", "Avittam"], ["சதயம்", "Sathayam"], ["பூரட்டாதி", "Poorattathi"],
  ["உத்திரட்டாதி", "Uthirattathi"], ["ரேவதி", "Revathi"],
];

export const YOGA = [
  ["விஷ்கம்பம்", "Vishkambam"], ["ப்ரீதி", "Preethi"], ["ஆயுஷ்மான்", "Ayushman"], ["சௌபாக்கியம்", "Saubhagyam"],
  ["சோபனம்", "Sobhanam"], ["அதிகண்டம்", "Athigandam"], ["சுகர்மம்", "Sukarmam"], ["திருதி", "Dhruthi"],
  ["சூலம்", "Soolam"], ["கண்டம்", "Gandam"], ["விருத்தி", "Vriddhi"], ["துருவம்", "Dhruvam"],
  ["வியாகாதம்", "Vyagatham"], ["ஹர்ஷணம்", "Harshanam"], ["வஜ்ரம்", "Vajram"], ["சித்தி", "Siddhi"],
  ["வியதீபாதம்", "Vyatheepatham"], ["வரீயான்", "Variyan"], ["பரிகம்", "Parigam"], ["சிவம்", "Sivam"],
  ["சித்தம்", "Sitham"], ["சாத்தியம்", "Sathyam"], ["சுபம்", "Subham"], ["சுப்பிரம்", "Subhram"],
  ["பிராம்யம்", "Brahmyam"], ["ஐந்திரம்", "Aindhram"], ["வைதிருதி", "Vaidhruthi"],
];

const KARANA_MOVABLE = [
  ["பவம்", "Bavam"], ["பாலவம்", "Balavam"], ["கௌலவம்", "Kaulavam"], ["தைதுலம்", "Thaithulam"],
  ["கரசை", "Karasai"], ["வணிசை", "Vanisai"], ["பத்திரை", "Pathirai"],
];
const KARANA_FIXED = [["சகுனி", "Sakuni"], ["சதுஷ்பாதம்", "Chathushpadham"], ["நாகவம்", "Nagavam"]];
const KIMSTUGHNA = ["கிம்ஸ்துக்னம்", "Kimsthugnam"];

// 60 half-tithis per lunar month: 0 = Kimstughna, 1..56 movable cycle, 57..59 fixed.
export function karanaName(k) {
  if (k === 0) return KIMSTUGHNA;
  if (k >= 57) return KARANA_FIXED[k - 57];
  return KARANA_MOVABLE[(k - 1) % 7];
}

export const VAARA = [
  ["ஞாயிற்றுக் கிழமை", "Sunday", "பானுவாரம்", "Gnayiru kizhamai"],
  ["திங்கள் கிழமை", "Monday", "சோமவாரம்", "Thingal kizhamai"],
  ["செவ்வாய்க் கிழமை", "Tuesday", "மங்களவாரம்", "Sevvai kizhamai"],
  ["புதன் கிழமை", "Wednesday", "சௌம்யவாரம்", "Budhan kizhamai"],
  ["வியாழக் கிழமை", "Thursday", "குருவாரம்", "Vyazhan kizhamai"],
  ["வெள்ளிக் கிழமை", "Friday", "சுக்கிரவாரம்", "Velli kizhamai"],
  ["சனிக் கிழமை", "Saturday", "சனிவாரம்", "Sani kizhamai"],
];
export const WEEKDAY_SHORT = [
  ["ஞாயிறு", "Sun"], ["திங்கள்", "Mon"], ["செவ்வாய்", "Tue"], ["புதன்", "Wed"],
  ["வியாழன்", "Thu"], ["வெள்ளி", "Fri"], ["சனி", "Sat"],
];
export const MONTH = [
  ["ஜனவரி", "Jan"], ["பிப்ரவரி", "Feb"], ["மார்ச்", "Mar"], ["ஏப்ரல்", "Apr"], ["மே", "May"], ["ஜூன்", "Jun"],
  ["ஜூலை", "Jul"], ["ஆகஸ்ட்", "Aug"], ["செப்டம்பர்", "Sep"], ["அக்டோபர்", "Oct"], ["நவம்பர்", "Nov"], ["டிசம்பர்", "Dec"],
];

// Tara cycle, counted from janma nakshatra (inclusive) to the day's nakshatra.
export const TARA = [
  { ta: "ஜென்மம்", en: "Janmam", quality: "mixed" },
  { ta: "சம்பத்", en: "Sampath", quality: "good" },
  { ta: "விபத்", en: "Vipath", quality: "bad" },
  { ta: "க்ஷேமம்", en: "Kshemam", quality: "good" },
  { ta: "பிரத்யக்", en: "Prathyak", quality: "bad" },
  { ta: "சாதகம்", en: "Sadhakam", quality: "good" },
  { ta: "வதம்", en: "Vadham", quality: "bad" },
  { ta: "மித்ரம்", en: "Mithram", quality: "good" },
  { ta: "பரம மித்ரம்", en: "Parama Mithram", quality: "good" },
];

export const RASI = [
  ["மேஷம்", "Mesham"], ["ரிஷபம்", "Rishabam"], ["மிதுனம்", "Mithunam"], ["கடகம்", "Kadagam"],
  ["சிம்மம்", "Simmam"], ["கன்னி", "Kanni"], ["துலாம்", "Thulam"], ["விருச்சிகம்", "Viruchigam"],
  ["தனுசு", "Dhanusu"], ["மகரம்", "Magaram"], ["கும்பம்", "Kumbam"], ["மீனம்", "Meenam"],
];

// [Tamil full, English full, Tamil abbr, English abbr]
export const GRAHA = {
  Lagna:   ["லக்னம்", "Lagna", "ல", "Asc"],
  Sun:     ["சூரியன்", "Sun", "சூ", "Su"],
  Moon:    ["சந்திரன்", "Moon", "சந்", "Mo"],
  Mars:    ["செவ்வாய்", "Mars", "செ", "Ma"],
  Mercury: ["புதன்", "Mercury", "பு", "Me"],
  Jupiter: ["குரு", "Jupiter", "கு", "Ju"],
  Venus:   ["சுக்கிரன்", "Venus", "சு", "Ve"],
  Saturn:  ["சனி", "Saturn", "ச", "Sa"],
  Rahu:    ["ராகு", "Rahu", "ரா", "Ra"],
  Ketu:    ["கேது", "Ketu", "கே", "Ke"],
};

export const DIGNITY = {
  own: ["ஆட்சி", "Own sign"],
  exalted: ["உச்சம்", "Exalted"],
  debilitated: ["நீசம்", "Debilitated"],
};
