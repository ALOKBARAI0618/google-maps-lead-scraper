// Maps Lead Scraper — City & Surrounding Areas Database
// 300+ cities (Indian + international) × ~15 areas each
// Used for auto-expanding searches to nearby locations

// Guard against double-injection. The manifest injects this file via
// content_scripts AND popup.js re-injects it through chrome.scripting when the
// content script isn't responding. Without this guard, re-running the file
// throws "Identifier 'CITY_AREAS' has already been declared". Wrapping the
// declarations in a block also keeps them block-scoped on re-injection.
if (typeof window.__cityAreasLoaded === 'undefined') {
  window.__cityAreasLoaded = true;

  const CITY_AREAS = {
    // ============================================================
    //  ASIA
    // ============================================================

    // ----- INDIA -----
    //   INDIA · Tier 1 (Metros)
    "mumbai": ["Navi Mumbai", "Thane", "Andheri", "Bandra", "Borivali", "Dadar", "Goregaon", "Malad", "Kandivali", "Powai", "Worli", "Chembur", "Mulund", "Kurla", "Vashi", "Panvel", "Kalyan", "Dombivli", "Mira Road", "Bhayandar"],
    "delhi": ["Noida", "Gurgaon", "Gurugram", "Faridabad", "Ghaziabad", "Dwarka", "Rohini", "Karol Bagh", "Saket", "Vasant Kunj", "Janakpuri", "Laxmi Nagar", "Pitampura", "Rajouri Garden", "Greater Noida", "Nehru Place", "Connaught Place", "Hauz Khas", "Indirapuram", "Lajpat Nagar"],
    "bangalore": ["Whitefield", "Electronic City", "Koramangala", "Indiranagar", "HSR Layout", "BTM Layout", "Marathahalli", "Jayanagar", "JP Nagar", "Bannerghatta Road", "Hebbal", "Yelahanka", "Rajajinagar", "Malleshwaram", "Sarjapur Road", "Bellandur", "Hosur Road", "Basavanagudi", "KR Puram"],
    "bengaluru": ["Whitefield", "Electronic City", "Koramangala", "Indiranagar", "HSR Layout", "BTM Layout", "Marathahalli", "Jayanagar", "JP Nagar", "Bannerghatta Road", "Hebbal", "Yelahanka", "Rajajinagar", "Malleshwaram", "Sarjapur Road"],
    "hyderabad": ["Gachibowli", "HITEC City", "Madhapur", "Kukatpally", "Secunderabad", "Kondapur", "Banjara Hills", "Jubilee Hills", "Ameerpet", "Begumpet", "Dilsukhnagar", "LB Nagar", "Uppal", "Miyapur", "Shamshabad", "Manikonda", "Tolichowki", "Sainikpuri"],
    "chennai": ["Anna Nagar", "T Nagar", "Velachery", "Adyar", "Tambaram", "Porur", "Guindy", "Nungambakkam", "Mylapore", "Perambur", "Chromepet", "Sholinganallur", "OMR", "ECR", "Ambattur", "Avadi", "Medavakkam", "Pallavaram"],
    "pune": ["Hinjewadi", "Kothrud", "Wakad", "Baner", "Viman Nagar", "Hadapsar", "Kharadi", "Aundh", "Shivajinagar", "Deccan", "Pimpri", "Chinchwad", "Magarpatta", "Koregaon Park", "Kalyani Nagar", "PCMC", "Undri", "Bavdhan"],
    "kolkata": ["Salt Lake", "Rajarhat", "Howrah", "Dum Dum", "New Town", "Garia", "Jadavpur", "Behala", "Tollygunge", "Park Street", "Ballygunge", "Baranagar", "Barasat", "Sealdah", "Esplanade", "Lake Town"],
    "ahmedabad": ["SG Highway", "Prahlad Nagar", "Satellite", "Navrangpura", "Maninagar", "Vastrapur", "Bopal", "Chandkheda", "Gota", "Thaltej", "Paldi", "CG Road", "Ashram Road", "Motera", "Naroda", "Gandhinagar"],
    "jaipur": ["Malviya Nagar", "Vaishali Nagar", "Mansarovar", "C Scheme", "Tonk Road", "Ajmer Road", "Raja Park", "Sodala", "Jagatpura", "Sanganer", "Sitapura", "Pratap Nagar", "Bani Park", "Vidhyadhar Nagar", "Durgapura"],
    "lucknow": ["Gomti Nagar", "Hazratganj", "Aliganj", "Indira Nagar", "Mahanagar", "Alambagh", "Aminabad", "Chowk", "Rajajipuram", "Vikas Nagar", "Chinhat", "Aashiana", "Jankipuram", "Faizabad Road", "Kanpur Road"],
    //   INDIA · Tier 2
    "chandigarh": ["Mohali", "Panchkula", "Zirakpur", "Kharar", "Sector 17", "Sector 22", "Sector 35", "Industrial Area", "Manimajra", "Baltana", "Derabassi", "Dera Bassi", "Rajpura", "Ambala", "IT Park"],
    "indore": ["Vijay Nagar", "Palasia", "Sapna Sangeeta", "MG Road", "Rajwada", "Bhawarkua", "Scheme 78", "Bhanwar Kuwa", "AB Road", "Ring Road", "Rau", "Mhow", "Pithampur", "Super Corridor", "Nipania"],
    "bhopal": ["MP Nagar", "Arera Colony", "New Market", "Habibganj", "Kolar Road", "Hoshangabad Road", "Bairagarh", "Misrod", "Ayodhya Nagar", "Shahpura", "Govindpura", "Berasia Road", "BHEL", "Trilanga", "Ashoka Garden"],
    "nagpur": ["Dharampeth", "Sadar", "Sitabuldi", "Wardha Road", "Hingna", "Manish Nagar", "Ramdaspeth", "Civil Lines", "Pratap Nagar", "Nandanvan", "Butibori", "Koradi", "Kamptee", "Lakadganj", "Itwari"],
    "surat": ["Adajan", "Vesu", "Varachha", "Athwa", "Ring Road", "Dumas Road", "Piplod", "Katargam", "Udhna", "Sachin", "Pal", "Althan", "City Light", "Majura Gate", "Rander"],
    "vadodara": ["Alkapuri", "Race Course", "Manjalpur", "Karelibaug", "Sayajigunj", "Fatehgunj", "Gotri", "Vasna", "Makarpura", "Subhanpura", "Harni", "Waghodia Road", "Akota", "Tandalja", "Old Padra Road"],
    "coimbatore": ["RS Puram", "Gandhipuram", "Saibaba Colony", "Peelamedu", "Singanallur", "Ganapathy", "Saravanampatti", "Kuniyamuthur", "Podanur", "Sulur", "Vadavalli", "Ramanathapuram", "Ukkadam", "Town Hall", "Hope College"],
    "kochi": ["Edappally", "Kakkanad", "Palarivattom", "Vyttila", "Kaloor", "Ernakulam", "Marine Drive", "MG Road", "Aluva", "Thrippunithura", "Fort Kochi", "Infopark", "Kalamassery", "Maradu", "Thevara"],
    "vizag": ["Gajuwaka", "MVP Colony", "Dwaraka Nagar", "Madhurawada", "Rushikonda", "Seethammadhara", "Pendurthi", "Gopalapatnam", "NAD Junction", "Asilmetta", "Beach Road", "Waltair", "Simhachalam", "Anakapalle", "Steel Plant"],
    "visakhapatnam": ["Gajuwaka", "MVP Colony", "Dwaraka Nagar", "Madhurawada", "Rushikonda", "Seethammadhara", "Pendurthi", "Gopalapatnam", "NAD Junction", "Asilmetta", "Beach Road", "Waltair", "Simhachalam", "Anakapalle", "Steel Plant"],
    "patna": ["Boring Road", "Kankarbagh", "Patna Junction", "Danapur", "Rajendra Nagar", "Bailey Road", "Ashiana Nagar", "Phulwari Sharif", "Saguna More", "Anisabad", "Gardanibagh", "Bankipur", "Mahendru", "Digha", "Naubatpur"],
    "ranchi": ["Main Road", "Doranda", "Harmu", "Kanke", "Bariatu", "Lalpur", "Morabadi", "Hinoo", "Kadru", "Ashok Nagar", "Kokar", "Namkum", "Ratu Road", "HEC", "Dhurwa"],
    "guwahati": ["Paltan Bazaar", "GS Road", "Zoo Road", "Ganeshguri", "Six Mile", "Dispur", "Chandmari", "Panbazar", "Maligaon", "Beltola", "Hatigaon", "Kahilipara", "Khanapara", "Ulubari", "Fancy Bazaar"],
    "dehradun": ["Rajpur Road", "Clock Tower", "Paltan Bazaar", "Race Course", "GMS Road", "Saharanpur Road", "Clement Town", "Prem Nagar", "Ballupur", "Nehru Colony", "Dalanwala", "Raipur", "Majra", "Doiwala", "Mussoorie Road"],
    "mysore": ["Saraswathipuram", "Kuvempunagar", "Vijayanagar", "Gokulam", "Jayalakshmipuram", "Nazarbad", "Lakshmipuram", "Hebbal", "Bogadi", "JP Nagar", "Bannimantap", "Yadavagiri", "Chamundipuram", "Siddarthanagar", "KRS Road"],
    "mysuru": ["Saraswathipuram", "Kuvempunagar", "Vijayanagar", "Gokulam", "Jayalakshmipuram", "Nazarbad", "Lakshmipuram", "Hebbal", "Bogadi", "JP Nagar", "Bannimantap", "Yadavagiri", "Chamundipuram", "Siddarthanagar", "KRS Road"],
    "mangalore": ["Hampankatta", "Kadri", "Bejai", "Kankanady", "Falnir", "Bendoorwell", "Derebail", "Surathkal", "Pumpwell", "Lalbagh", "Mannagudda", "Balmatta", "Kodialbail", "Kottara", "Panambur"],
    "mangaluru": ["Hampankatta", "Kadri", "Bejai", "Kankanady", "Falnir", "Bendoorwell", "Derebail", "Surathkal", "Pumpwell", "Lalbagh", "Mannagudda", "Balmatta", "Kodialbail", "Kottara", "Panambur"],
    "trivandrum": ["Technopark", "Kazhakkoottam", "Pattom", "Kowdiar", "Vazhuthacaud", "Thampanoor", "Vellayambalam", "Sasthamangalam", "Palayam", "Sreekaryam", "Kesavadasapuram", "Statue", "Ulloor", "Nalanchira", "Attingal"],
    "thiruvananthapuram": ["Technopark", "Kazhakkoottam", "Pattom", "Kowdiar", "Vazhuthacaud", "Thampanoor", "Vellayambalam", "Sasthamangalam", "Palayam", "Sreekaryam", "Kesavadasapuram", "Statue", "Ulloor", "Nalanchira", "Attingal"],
    "madurai": ["Anna Nagar", "KK Nagar", "Goripalayam", "Mattuthavani", "Tallakulam", "Villapuram", "Thirunagar", "SS Colony", "Teppakulam", "Ellis Nagar", "Jaihindpuram", "Koodal Nagar", "Palanganatham", "Arapalayam", "Simmakal"],
    "rajkot": ["Kalawad Road", "University Road", "Gondal Road", "150 Feet Ring Road", "Yagnik Road", "Bhaktinagar", "Raiya Road", "Amin Marg", "Kalavad Road", "Pedak Road", "Kotecha Chowk", "Mavdi", "Sorathiyawadi", "Trikon Baug", "Nana Mava Road"],
    "jodhpur": ["Shastri Nagar", "Sardarpura", "Ratanada", "Paota", "Basni", "Mandore", "Air Force Area", "Chopasni Road", "Residency Road", "Kamla Nehru Nagar", "Pal Road", "Pali Road", "Nai Sarak", "Station Road", "Circuit House Area"],
    "udaipur": ["Hiran Magri", "Sector 11", "Sector 14", "Fateh Sagar", "Sukhadia Circle", "Chetak Circle", "Durga Nursery", "University Road", "Airport Road", "Bedla Road", "Ashok Nagar", "Goverdhan Vilas", "Shobhagpura", "Bhuwana", "Ambamata"],
    "nashik": ["College Road", "Gangapur Road", "Panchavati", "Satpur", "Cidco", "Indira Nagar", "Nashik Road", "Deolali", "Pathardi", "Makhmalabad", "Dwarka", "Jail Road", "Sharanpur", "Tidke Colony", "Ashok Stambh"],
    "aurangabad": ["Cidco", "Jalna Road", "Station Road", "Kranti Chowk", "Gulmandi", "Osmanpura", "Cantonment", "Waluj", "Beed Bypass", "Nirala Bazaar", "Mondha", "Shahgunj", "Roshan Gate", "Garkheda", "Satara"],
    "amritsar": ["Lawrence Road", "Mall Road", "Ranjit Avenue", "GT Road", "White Avenue", "Green Avenue", "Majitha Road", "Batala Road", "Circular Road", "Court Road", "Chheharta", "Putlighar", "Sultanwind Road", "Hall Gate", "Maqbool Road"],
    "ludhiana": ["Model Town", "Sarabha Nagar", "Dugri", "BRS Nagar", "Pakhowal Road", "Ferozepur Road", "Civil Lines", "Rajguru Nagar", "Chaura Bazaar", "Gurdev Nagar", "Sector 32", "Haibowal", "Salem Tabri", "Focal Point", "Clock Tower"],
    "kanpur": ["Mall Road", "Swaroop Nagar", "Kidwai Nagar", "Govind Nagar", "Kakadeo", "Shastri Nagar", "Civil Lines", "Panki", "Kalyanpur", "Arya Nagar", "Lajpat Nagar", "Rawatpur", "Harsh Nagar", "Tilak Nagar", "Kakadev"],
    //   INDIA · Tier 3
    "raipur": ["Shankar Nagar", "Devendra Nagar", "Pandri", "Telibandha", "Tatibandh", "VIP Road", "Station Road", "Mowa", "Fafadih", "Amanaka", "Ring Road", "Bhopal Ganj", "Byron Bazaar", "Shanti Nagar", "Gudhiyari"],
    "bhubaneswar": ["Saheed Nagar", "Jaydev Vihar", "Patia", "Chandrasekharpur", "Nayapalli", "Bapuji Nagar", "Unit 1", "Master Canteen", "Khandagiri", "Mancheswar", "Rasulgarh", "Acharya Vihar", "Baramunda", "Laxmisagar", "Bomikhal"],
    "agra": ["Sanjay Place", "Sikandra", "Fatehabad Road", "MG Road", "Kamla Nagar", "Shahganj", "Dayalbagh", "Taj Nagri", "Rakabganj", "Civil Lines", "Sadar Bazaar", "Raja Mandi", "Belanganj", "Lohamandi", "Bodla"],
    "varanasi": ["Lanka", "Sigra", "Godowlia", "Cantonment", "Bhelupur", "Sarnath", "Nadesar", "Mahmoorganj", "DLW", "Pandeypur", "Shivpur", "Dashashwamedh", "Kabir Chaura", "Luxa", "Maldahiya"],
    "allahabad": ["Civil Lines", "Georgetown", "Katra", "Zero Road", "Naini", "Jhunsi", "Daraganj", "Lukerganj", "Tagore Town", "Allapur", "Bamrauli", "Kareli", "Rajapur", "Teliarganj", "Mumfordganj"],
    "prayagraj": ["Civil Lines", "Georgetown", "Katra", "Zero Road", "Naini", "Jhunsi", "Daraganj", "Lukerganj", "Tagore Town", "Allapur", "Bamrauli", "Kareli", "Rajapur", "Teliarganj", "Mumfordganj"],
    "meerut": ["Abu Lane", "Sadar Bazaar", "Cantt", "Shastri Nagar", "Pallavpuram", "Begumpul", "Western Kutchery", "Hapur Road", "Garh Road", "Delhi Road", "Lal Kurti", "Brahmpuri", "Bachcha Park", "Suraj Kund", "Partapur"],
    "jalandhar": ["Model Town", "BMC Chowk", "GT Road", "Maqsudan", "Lajpat Nagar", "Civil Lines", "PAP Chowk", "Nakodar Road", "Rama Mandi", "Basti Sheikh", "Green Model Town", "Guru Nanak Pura", "Adarsh Nagar", "Defence Colony", "Urban Estate"],
    "jammu": ["Gandhi Nagar", "Residency Road", "Kachi Chawni", "Janipur", "Talab Tillo", "Bakshi Nagar", "Nanak Nagar", "Trikuta Nagar", "Channi Himmat", "Rehari", "Canal Road", "BC Road", "Parade", "Paloura", "Bahu Plaza"],
    "shimla": ["Mall Road", "Lakkar Bazaar", "Sanjauli", "Panthaghati", "Chhota Shimla", "Tutikandi", "New Shimla", "Mashobra", "Kufri", "Boileauganj", "Krishna Nagar", "Dhalli", "Summer Hill", "Totu", "Kasumpti"],
    "goa": ["Panaji", "Margao", "Vasco", "Mapusa", "Calangute", "Baga", "Anjuna", "Candolim", "Porvorim", "Dona Paula", "Ponda", "Bicholim", "Old Goa", "Miramar", "Taleigao"],
    "pondicherry": ["White Town", "MG Road", "Anna Nagar", "Nehru Street", "Lawspet", "Mudaliarpet", "Villianur", "Ariyankuppam", "Reddiarpalayam", "Muthialpet", "Nellithope", "Oulgaret", "Kalapet", "ECR Road", "Serenity Beach"],
    "siliguri": ["Sevoke Road", "Hill Cart Road", "Matigara", "Pradhan Nagar", "Salugara", "Dagapur", "Bidhan Road", "Court More", "Hakimpara", "Subhash Pally", "Bagdogra", "Sukna", "NJP", "Champasari", "Iskon"],
    "jamshedpur": ["Bistupur", "Sakchi", "Kadma", "Mango", "Telco", "Sonari", "Adityapur", "Golmuri", "Dimna", "Baridih", "Pardih", "Sitaramdera", "Agrico", "Jugsalai", "Bhalubasa"],
    "dhanbad": ["Hirapur", "Bank More", "Saraidhela", "Jharia", "Katras", "Sindri", "Govindpur", "Dhansar", "Wasseypur", "Kenduadih", "Joraphatak", "Bhaga", "Putki", "Baliapur", "Chas"],
    "bareilly": ["Civil Lines", "Kutubkhana", "CB Ganj", "Rajendra Nagar", "Izzat Nagar", "Prem Nagar", "Subhash Nagar", "Deen Dayal Puram", "Satellite Town", "Rampur Garden", "Faridpur", "Cantt", "Bada Bazaar", "Hafizganj", "Quila"],
    "vijayawada": ["Benz Circle", "Governorpet", "Patamata", "Auto Nagar", "Gunadala", "Labbipet", "Bhavanipuram", "Moghalrajpuram", "Poranki", "Kanuru", "Gannavaram", "Ramavarappadu", "Penamaluru", "One Town", "Currency Nagar"],
    "tirupati": ["Tirumala", "Tiruchanoor", "Renigunta", "Alipiri", "RC Road", "Air Bypass Road", "Korlagunta", "Leela Mahal", "Karakambadi", "MR Palli", "Kapilatheertham", "Padmavathi Nagar", "Avilala", "Settipalli", "AIR Bypass"],
    "guntur": ["Brodipet", "Arundelpet", "Lakshmipuram", "Pattabhipuram", "Kothapet", "Nallapadu", "Gorantla", "Amaravati Road", "Naaz Center", "Old Guntur", "Sangadigunta", "Chuttugunta", "SVN Colony", "Pedakakani", "Etukuru"],
    "nellore": ["Magunta Layout", "Dargamitta", "Brundavanam", "Stonehousepet", "Vedayapalem", "Balaji Nagar", "Santhapet", "Kothur", "Ramamurthy Nagar", "Pogathota", "AC Nagar", "Mulapeta", "Buchireddypalem", "Podalakur Road", "Trunk Road"],
    "rajahmundry": ["Danavaipeta", "Innespeta", "Aryapuram", "Morampudi", "Gandhipuram", "Kotipalli Bus Stand", "Devi Chowk", "Tilak Road", "Lalacheruvu", "Kambala Tank", "Nidadavole Road", "Bommuru", "Katheru", "Diwancheruvu", "Jaypanagar"],
    "warangal": ["Hanamkonda", "Kazipet", "Subedari", "Hunter Road", "Mulugu Road", "Balasamudram", "Naimnagar", "Waddepally", "Kishanpura", "Fort Road", "Station Road", "Nakkalagutta", "Excise Colony", "Rangashaipet", "Girmajipet"],
    "salem": ["Fairlands", "Hasthampatti", "Five Roads", "Junction", "Ammapet", "Suramangalam", "Shevapet", "Kondalampatti", "Gugai", "New Bus Stand", "Alagapuram", "Meyyanur", "Ramakrishna Road", "Kitchipalayam", "Yercaud Road"],
    "trichy": ["Srirangam", "Thillai Nagar", "Cantonment", "Woraiyur", "KK Nagar", "Thiruverumbur", "Crawford", "Chathiram", "Central Bus Stand", "Palpannai", "Tennur", "Ariyamangalam", "Khajamalai", "Puthur", "Golden Rock"],
    "tirunelveli": ["Palayamkottai", "Town", "Vannarpettai", "Melapalayam", "Thatchanallur", "Pettai", "Maharaja Nagar", "Perumalpuram", "KTC Nagar", "Reddiarpatti", "Junction", "High Ground", "Murugankurichi", "Sankar Nagar", "Tharuvai"],
    "erode": ["Perundurai Road", "Brough Road", "Karungalpalayam", "Surampatti", "GH Road", "Veerappanchatram", "Thindal", "Solar", "Sampath Nagar", "Rangampalayam", "Mettur Road", "Bhavani", "Chithode", "Kollampalayam", "Periya Semur"],
    "vellore": ["Katpadi", "Sathuvachari", "Gandhi Nagar", "Thottapalayam", "Bagayam", "Konavattam", "Officers Line", "Old Town", "Vasanthapuram", "Viruthampet", "Kangeyanallur", "Allapuram", "Shenbakkam", "Thorapadi", "Dharapadavedu"],
    "thrissur": ["Round", "Ayyanthole", "Ollur", "Punkunnam", "East Fort", "West Fort", "Poothole", "Pullazhi", "Koorkenchery", "Mannuthy", "Viyyur", "Patturaikkal", "Chembukkavu", "Kuriachira", "Nadathara"],
    "kozhikode": ["Beach Road", "Mavoor Road", "Nadakkavu", "Kallai", "Mananchira", "Palayam", "Chevayur", "Medical College", "Westhill", "East Hill", "Pottammal", "Vellayil", "Thondayad", "Karaparamba", "Eranhipalam"],
    "kollam": ["Chinnakada", "Kadappakada", "Asramam", "Thangassery", "Kilikollur", "Kottiyam", "Mundakkal", "Vadakkevila", "Sakthikulangara", "Pallithottam", "Uliyakovil", "Karbala", "Polayathode", "Thevally", "Kavanad"],
    "kannur": ["Thavakkara", "Caltex", "Talap", "Kannothumchal", "Payyambalam", "Chovva", "Thana", "Pallikkunnu", "Mele Chovva", "Edakkad", "Puthiyatheru", "Kakkad", "Chalad", "Elayavoor", "Munderi"],
    "kottayam": ["Nagambadam", "Kanjikuzhy", "Gandhinagar", "Collectorate", "Thirunakkara", "Pallom", "Puthuppally", "Ettumanoor", "Nattakom", "Kodimatha", "Vijayapuram", "Aymanam", "Chingavanam", "Kumaranalloor", "Manarcad"],
    "gwalior": ["Lashkar", "Morar", "City Centre", "Thatipur", "DD Nagar", "Gola Ka Mandir", "Hazira", "Phool Bagh", "Madhav Nagar", "Govindpuri", "Sirol", "Bahodapur", "Kampoo", "Maharaj Bada", "Jiwaji University"],
    "jabalpur": ["Napier Town", "Wright Town", "Gorakhpur", "Adhartal", "Madan Mahal", "Ranjhi", "Civil Lines", "Vijay Nagar", "Tilwara", "Garha", "Gohalpur", "Sadar", "Cantt", "Katanga", "Russel Chowk"],
    "ujjain": ["Freeganj", "Mahakal", "Nanakheda", "Dewas Road", "Agar Road", "Chimanganj", "Rishi Nagar", "Madhav Nagar", "Indore Road", "Nagziri", "Kshipra", "Tower Chowk", "Jaisinghpura", "Chamunda", "University Road"],
    "bhilai": ["Nehru Nagar", "Sector 1", "Sector 9", "Power House", "Supela", "Smriti Nagar", "Junwani", "Civic Centre", "Risali", "Khursipar", "Hudco", "Camp 1", "Vaishali Nagar", "Kohka", "Maroda"],
    "cuttack": ["Buxi Bazaar", "Badambadi", "College Square", "Link Road", "Madhupatna", "Choudhury Bazaar", "CDA", "Ranihat", "Bidanasi", "Tulsipur", "Nayasarak", "Jobra", "Mahanadi Vihar", "Chauliaganj", "Sutahat"],
    "rourkela": ["Civil Township", "Uditnagar", "Basanti Colony", "Chhend", "Panposh", "Sector 2", "Sector 5", "Koel Nagar", "Bisra", "Hamirpur", "Jagda", "Sector 19", "Fertilizer Township", "Vedvyas", "Kalunga"],
    "gaya": ["Civil Lines", "AP Colony", "Gewal Bigha", "Delha", "Rampur", "Kujapi", "Manpur", "Tekari Road", "Bodh Gaya", "Magadh University", "Chand Chaura", "Swarajpuri Road", "Buniyadganj", "Mustafabad", "Naily"],
    "bhagalpur": ["Tilkamanjhi", "Bhikanpur", "Adampur", "Nathnagar", "Sabour", "Mojahidpur", "Barari", "Champa Nagar", "Khalifabagh", "Lajpat Nagar", "Ishakchak", "Zero Mile", "Kotwali", "Mayaganj", "Habibpur"],
    "jamnagar": ["Bedi", "Patel Colony", "Park Colony", "Indira Marg", "Gulab Nagar", "Digjam Circle", "Bedeshwar", "Khambhalia Road", "Pancheshwar", "Summair Club Road", "Lal Bunglow", "Ranjit Sagar", "Hapa", "Dared", "Gurudwara Road"],
    "bhavnagar": ["Waghawadi Road", "Kalanala", "Ghogha Circle", "Krishnanagar", "Subhash Nagar", "Vidyanagar", "Rupani Circle", "Panwadi", "Takhteshwar", "Nilambag", "Shastri Nagar", "Sardar Nagar", "Chitra", "Akwada", "Ghogha Road"],
    "gandhinagar": ["Sector 7", "Sector 11", "Sector 16", "Sector 21", "Infocity", "Kudasan", "Sargasan", "Pethapur", "Sector 28", "Sector 1", "Raysan", "Adalaj", "Randheja", "Vavol", "GIFT City"],
    "ajmer": ["Vaishali Nagar", "Civil Lines", "Pushkar Road", "Adarsh Nagar", "Panchsheel", "Madar Gate", "Kaisarganj", "Foy Sagar Road", "Ramganj", "Beawar Road", "Naya Bazaar", "Alwar Gate", "Jaipur Road", "Topdara", "Shastri Nagar"],
    "kota": ["Vigyan Nagar", "Talwandi", "Gumanpura", "Mahaveer Nagar", "Dadabari", "Rangbari", "Borkhera", "Chhawni", "Jhalawar Road", "Indraprastha", "Kunhari", "Nayapura", "Station Area", "Aerodrome Circle", "DCM Road"],
    "bikaner": ["Rani Bazaar", "Jaipur Road", "Gangashahar", "Sadar Bazaar", "Pawanpuri", "Nokha Road", "Jassusar Gate", "Kote Gate", "Joshiwara", "Bhinasar", "Lalgarh", "Murlidhar Vyas Colony", "Tilak Nagar", "Sardarshahar Road", "Sri Ganganagar Road"],
    "moradabad": ["Civil Lines", "Buddhi Vihar", "Majhola", "Mansarovar Colony", "Deen Dayal Nagar", "Lajpat Nagar", "Kanth Road", "Delhi Road", "Ramganga Vihar", "Pakbara", "Chakkar Ki Milak", "Lakdi Phazalpur", "Karula", "Asalatpura", "Galshaheed"],
    "aligarh": ["Civil Lines", "Marris Road", "Ramghat Road", "Sasni Gate", "Quarsi", "ADA Colony", "Dodhpur", "Bannadevi", "Gandhi Park", "Centre Point", "Jawahar Park", "Avantika", "Sarai Sultani", "Anoopshahr Road", "AMU Campus"],
    "gorakhpur": ["Golghar", "Civil Lines", "Mohaddipur", "Betiahata", "Taramandal", "Rustampur", "Shahpur", "Bichhia", "Medical College Road", "Padri Bazaar", "Asuran", "Raptinagar", "University", "Daudpur", "Basharatpur"],
    "jhansi": ["Civil Lines", "Sipri Bazar", "Sadar Bazar", "Nayakhera", "Gwalior Road", "Kanpur Road", "Medical College", "Bijauli", "Shivpuri Road", "Bara Bazar", "Datia Gate", "Elite Crossing", "Bhagwantpura", "Khati Baba", "Sainik Colony"],
    "haridwar": ["Har Ki Pauri", "Jwalapur", "Kankhal", "BHEL", "Ranipur", "Shivalik Nagar", "Bhimgoda", "Roorkee Road", "Jagjeetpur", "Bahadrabad", "Pant Dweep", "Mayapur", "Sapt Sarovar", "Devpura", "Sharvan Nath Nagar"],
    "patiala": ["Leela Bhawan", "Model Town", "Tripuri", "Urban Estate", "Rajpura Road", "Bhupindra Road", "Sirhind Road", "Factory Area", "Anardana Chowk", "Sanauri Adda", "Bahadurgarh", "Nabha Road", "Dukheri", "Punjabi University", "Lahori Gate"],
    "panipat": ["Model Town", "Sector 11", "Sector 12", "Sector 13-17", "GT Road", "Assandh Road", "Tehsil Camp", "Kabri", "Sanoli Road", "Hali Colony", "Rishi Nagar", "Babail", "Huda", "Old Industrial Area", "Krishnapura"],
    "rohtak": ["Model Town", "Delhi Road", "Sector 1", "Sector 14", "Subhash Nagar", "Hisar Road", "Jhajjar Road", "Sonipat Road", "Prem Nagar", "Shivaji Colony", "Bohar", "DLF Colony", "Mansarovar", "Vikas Nagar", "Janta Colony"],
    "durgapur": ["City Centre", "Benachity", "Bidhannagar", "Steel Township", "Muchipara", "Bhiringi", "Sepco", "A-Zone", "B-Zone", "Amrai", "Fuljhore", "Gandhi More", "Mamra", "Rajbandh", "Kadma"],
    "asansol": ["GT Road", "Burnpur", "Hutton Road", "Ushagram", "Apcar Garden", "Court More", "Senraleigh Road", "Asansol Bazar", "Kanyapur", "Dhadka", "Sripally", "Murgasol", "Bata More", "Rahalane", "Kalipahari"],
    "shillong": ["Police Bazar", "Laitumkhrah", "Mawlai", "Nongthymmai", "Polo", "Laban", "Rilbong", "Jaiaw", "Mawprem", "Nongrim Hills", "Lapalang", "Madanrting", "Umpling", "Happy Valley", "Cleve Colony"],
    "silchar": ["Tarapur", "Rangirkhari", "Premtala", "Sonai Road", "Ambicapatty", "Itkhola", "National Highway", "Link Road", "Meherpur", "Ramnagar", "College Road", "Public School Road", "Hospital Road", "Malugram", "Vivekananda Road"],

    // ----- PAKISTAN -----
    "karachi": ["Clifton", "Defence", "Gulshan-e-Iqbal", "Saddar", "PECHS", "Nazimabad", "North Nazimabad", "Bahadurabad", "Malir", "Korangi", "Gulistan-e-Johar", "DHA", "Tariq Road", "Federal B Area", "Shahra-e-Faisal"],
    "lahore": ["Gulberg", "DHA", "Model Town", "Johar Town", "Cantt", "Garden Town", "Bahria Town", "Faisal Town", "Iqbal Town", "Township", "Anarkali", "Wapda Town", "Cavalry Ground", "Askari", "Shadman"],
    "islamabad": ["F-6", "F-7", "F-8", "F-10", "F-11", "G-9", "G-10", "G-11", "Blue Area", "Bahria Town", "DHA", "E-11", "I-8", "Diplomatic Enclave", "Margalla Town"],

    // ----- BANGLADESH -----
    "dhaka": ["Gulshan", "Banani", "Dhanmondi", "Uttara", "Bashundhara", "Mohakhali", "Motijheel", "Mirpur", "Baridhara", "Old Dhaka", "Tejgaon", "Farmgate", "Wari", "Badda", "Khilgaon"],

    // ----- SRI LANKA -----
    "colombo": ["Colombo 1", "Colombo 3", "Colombo 4", "Colombo 5", "Colombo 7", "Bambalapitiya", "Kollupitiya", "Cinnamon Gardens", "Wellawatte", "Nugegoda", "Dehiwala", "Mount Lavinia", "Rajagiriya", "Battaramulla", "Pettah"],

    // ----- NEPAL -----
    "kathmandu": ["Thamel", "Durbar Marg", "Lazimpat", "Baneshwor", "Patan", "Boudha", "Jhamsikhel", "Kupondole", "Sanepa", "Maharajgunj", "Baluwatar", "New Road", "Chabahil", "Kalanki", "Sinamangal"],

    // ----- SINGAPORE -----
    "singapore": ["Orchard", "Marina Bay", "Raffles Place", "Jurong", "Tampines", "Clementi", "Bugis", "Chinatown", "Little India", "Clarke Quay", "Sentosa", "Changi", "Toa Payoh", "Ang Mo Kio", "Woodlands"],

    // ----- MALAYSIA -----
    "kuala lumpur": ["KLCC", "Bukit Bintang", "Mont Kiara", "Bangsar", "Petaling Jaya", "Subang Jaya", "Damansara", "Cheras", "Ampang", "Cyberjaya", "Putrajaya", "Sri Hartamas", "Setapak", "Kepong", "Sentul"],

    // ----- THAILAND -----
    "bangkok": ["Sukhumvit", "Silom", "Sathorn", "Siam", "Pratunam", "Asoke", "Thonglor", "Ekkamai", "Chatuchak", "Lat Phrao", "Bang Na", "Ari", "Ratchada", "Phra Khanong", "On Nut"],
    "chiang mai": ["Old City", "Nimmanhaemin", "Santitham", "Chang Klan", "Night Bazaar", "Hang Dong", "Mae Rim", "San Sai", "Suthep", "Wat Ket", "Chang Phueak", "Riverside", "Doi Saket", "Saraphi", "Mae Hia"],
    "phuket": ["Patong", "Kata", "Karon", "Phuket Town", "Rawai", "Kamala", "Bang Tao", "Chalong", "Nai Harn", "Surin", "Kathu", "Cherng Talay", "Mai Khao", "Nai Yang", "Thalang"],

    // ----- VIETNAM -----
    "ho chi minh city": ["District 1", "District 2", "District 3", "District 5", "District 7", "Binh Thanh", "Phu Nhuan", "Thao Dien", "Tan Binh", "Go Vap", "District 4", "District 10", "Thu Duc", "Nha Be", "District 6"],
    "hanoi": ["Old Quarter", "Hoan Kiem", "Tay Ho", "Ba Dinh", "Dong Da", "Cau Giay", "Hai Ba Trung", "Long Bien", "Thanh Xuan", "My Dinh", "Hoang Mai", "Tran Duy Hung", "Nam Tu Liem", "Ciputra", "Truc Bach"],
    "da nang": ["Hai Chau", "Son Tra", "My Khe", "Thanh Khe", "Ngu Hanh Son", "Cam Le", "Lien Chieu", "An Hai", "Han River", "Non Nuoc", "My An", "Hoa Vang", "Nam O", "An Thuong", "Thanh Binh"],

    // ----- CAMBODIA -----
    "phnom penh": ["Daun Penh", "BKK1", "Toul Tom Poung", "Chroy Changvar", "Sen Sok", "Chamkarmon", "Russian Market", "Tonle Bassac", "Riverside", "Boeung Keng Kang", "7 Makara", "Toul Kork", "Meanchey", "Chbar Ampov", "Olympic"],

    // ----- MYANMAR -----
    "yangon": ["Downtown", "Bahan", "Kamayut", "Sanchaung", "Yankin", "Hlaing", "Dagon", "Mayangone", "Ahlone", "Insein", "Tamwe", "Kyauktada", "Botataung", "Thingangyun", "Golden Valley"],

    // ----- INDONESIA -----
    "jakarta": ["Menteng", "Kuningan", "Kemang", "Senayan", "Sudirman", "Thamrin", "Kelapa Gading", "Pondok Indah", "Cikini", "Tebet", "Kebayoran", "Pluit", "Cengkareng", "Cilandak", "Setiabudi"],
    "bali": ["Seminyak", "Canggu", "Ubud", "Kuta", "Denpasar", "Sanur", "Jimbaran", "Nusa Dua", "Legian", "Uluwatu", "Kerobokan", "Pererenan", "Sidemen", "Berawa", "Petitenget"],
    "surabaya": ["Gubeng", "Wonokromo", "Rungkut", "Tunjungan", "Darmo", "Sukolilo", "Wiyung", "Mulyorejo", "Gunung Anyar", "Tegalsari", "Genteng", "Sawahan", "Kenjeran", "Lakarsantri", "Dukuh Pakis"],

    // ----- PHILIPPINES -----
    "manila": ["Makati", "Quezon City", "Taguig", "Pasig", "Manila City", "Mandaluyong", "Pasay", "Paranaque", "Marikina", "Muntinlupa", "BGC", "Ortigas", "Ermita", "Malate", "Alabang"],
    "cebu": ["Cebu City", "IT Park", "Lahug", "Mandaue", "Lapu-Lapu", "Banilad", "Talamban", "Mabolo", "Guadalupe", "Capitol Site", "Fuente", "Colon", "Talisay", "Consolacion", "Ayala Center"],

    // ----- CHINA -----
    "beijing": ["Chaoyang", "Sanlitun", "Haidian", "Dongcheng", "Xicheng", "Wangfujing", "Guomao", "Zhongguancun", "Wudaokou", "Gulou", "Shunyi", "Fengtai", "Wangjing", "Dongzhimen", "Sanyuanqiao"],
    "shanghai": ["The Bund", "Pudong", "Jing'an", "Xuhui", "Huangpu", "Changning", "Hongkou", "Yangpu", "Putuo", "Minhang", "Lujiazui", "Xintiandi", "French Concession", "Zhabei", "Baoshan"],
    "guangzhou": ["Tianhe", "Yuexiu", "Haizhu", "Liwan", "Panyu", "Zhujiang New Town", "Baiyun", "Huangpu", "Beijing Road", "Shangxiajiu", "Ersha Island", "Tianhe Sports Center", "Pazhou", "Nansha", "Fangcun"],
    "shenzhen": ["Futian", "Nanshan", "Luohu", "Bao'an", "Shekou", "OCT", "Coco Park", "Longgang", "Longhua", "Yantian", "Houhai", "Dongmen", "Che Kung Temple", "Nanyou", "Guangming"],
    "chengdu": ["Jinjiang", "Wuhou", "Qingyang", "Chenghua", "Jinniu", "Gaoxin", "Tianfu New Area", "Chunxi Road", "Kuanzhai Alley", "Taikoo Li", "Jinli", "Wenjiang", "Longquanyi", "Xindu", "Shuangliu"],
    "hangzhou": ["West Lake", "Xihu", "Binjiang", "Gongshu", "Shangcheng", "Xiacheng", "Jianggan", "Yuhang", "Xiaoshan", "Qianjiang New City", "Wulin", "Xixi", "Linping", "Fuyang", "Cuiyuan"],
    "wuhan": ["Wuchang", "Hankou", "Hanyang", "Jiang'an", "Jianghan", "Hongshan", "Optics Valley", "Qiaokou", "Qingshan", "Donghu", "Guanggu", "Zhuankou", "Baibuting", "Xudong", "Wangjiawan"],

    // ----- HONG KONG -----
    "hong kong": ["Central", "Tsim Sha Tsui", "Mong Kok", "Causeway Bay", "Wan Chai", "Kowloon", "Sha Tin", "Kwun Tong", "Sham Shui Po", "North Point", "Aberdeen", "Stanley", "Yau Ma Tei", "Quarry Bay", "Tuen Mun"],

    // ----- TAIWAN -----
    "taipei": ["Xinyi", "Da'an", "Zhongshan", "Ximending", "Songshan", "Shilin", "Beitou", "Wanhua", "Zhongzheng", "Neihu", "Datong", "Nangang", "Wenshan", "Tianmu", "Gongguan"],
    "kaohsiung": ["Zuoying", "Sanmin", "Lingya", "Gushan", "Qianzhen", "Yancheng", "Xinxing", "Fengshan", "Cianjhen", "Nanzih", "Sinsing", "Cijin", "Gangshan", "Niaosong", "Dashe"],

    // ----- JAPAN -----
    "tokyo": ["Shibuya", "Shinjuku", "Ginza", "Roppongi", "Akihabara", "Asakusa", "Ikebukuro", "Shimbashi", "Ueno", "Harajuku", "Nakameguro", "Daikanyama", "Kichijoji", "Ebisu", "Marunouchi"],
    "osaka": ["Namba", "Umeda", "Shinsaibashi", "Tennoji", "Dotonbori", "Honmachi", "Kyobashi", "Nakanoshima", "Tsuruhashi", "Abeno", "Bay Area", "Shin-Osaka", "Sakai", "Esaka", "Nipponbashi"],
    "kyoto": ["Gion", "Higashiyama", "Arashiyama", "Kawaramachi", "Fushimi", "Nakagyo", "Sakyo", "Shimogyo", "Kamigyo", "Pontocho", "Kiyomizu", "Nishijin", "Uzumasa", "Yamashina", "Demachiyanagi"],
    "yokohama": ["Minato Mirai", "Kannai", "Motomachi", "Chinatown", "Naka", "Nishi", "Kohoku", "Tsurumi", "Kanagawa", "Sakuragicho", "Bashamichi", "Isogo", "Totsuka", "Aoba", "Kanazawa"],
    "nagoya": ["Sakae", "Nagoya Station", "Meieki", "Osu", "Kanayama", "Chikusa", "Fushimi", "Higashiyama", "Nakamura", "Naka", "Showa", "Mizuho", "Atsuta", "Chikusa", "Imaike"],
    "sapporo": ["Susukino", "Odori", "Chuo", "Kita", "Higashi", "Shiroishi", "Toyohira", "Minami", "Nishi", "Teine", "Atsubetsu", "Kiyota", "Maruyama", "Sapporo Station", "Makomanai"],
    "fukuoka": ["Tenjin", "Hakata", "Nakasu", "Ohori", "Daimyo", "Momochi", "Nishijin", "Yakuin", "Ropponmatsu", "Chuo", "Higashi", "Minami", "Sawara", "Jonan", "Kego"],

    // ----- SOUTH KOREA -----
    "seoul": ["Gangnam", "Hongdae", "Itaewon", "Myeongdong", "Jongno", "Insadong", "Yeouido", "Apgujeong", "Sinchon", "Gangbuk", "Mapo", "Songpa", "Jamsil", "Yongsan", "Seongdong"],
    "busan": ["Haeundae", "Seomyeon", "Nampo-dong", "Gwangalli", "Centum City", "Nampodong", "Dongnae", "Gwangan", "Jung-gu", "Busanjin", "Suyeong", "Sasang", "Yeongdo", "Songjeong", "Marine City"],
    "incheon": ["Songdo", "Bupyeong", "Guwol-dong", "Yeonsu", "Namdong", "Juan", "Cheongna", "Yeongjong", "Dongchun", "Michuhol", "Gyeyang", "Seo-gu", "Ganghwa", "Wolmido", "Namchon"],

    // ============================================================
    //  MIDDLE EAST
    // ============================================================

    // ----- UNITED ARAB EMIRATES -----
    "dubai": ["Downtown Dubai", "Business Bay", "JLT", "Marina", "DIFC", "Deira", "Bur Dubai", "JBR", "Silicon Oasis", "Internet City", "Media City", "Al Barsha", "Jumeirah", "Springs", "Discovery Gardens"],
    "abu dhabi": ["Corniche", "Al Reem Island", "Saadiyat Island", "Yas Island", "Khalifa City", "Al Raha", "Tourist Club", "Hamdan Street", "Mussafah", "Al Ain", "Masdar City", "Al Maryah Island", "Capital Centre", "Electra Street", "Defence Street"],
    "sharjah": ["Al Majaz", "Al Nahda", "Al Qasimia", "Al Khan", "Al Layyah", "Al Taawun", "Al Nud", "Muwaileh", "Al Butina", "Al Gharb", "Al Mamzar", "Al Rolla", "Halwan", "Al Suyoh", "Al Riqqa"],

    // ----- SAUDI ARABIA -----
    "riyadh": ["Olaya", "King Fahd District", "Malaz", "Al Mohammadiyah", "Al Sulaimaniyah", "Al Wurud", "Al Murabba", "Hittin", "Al Nakheel", "Al Yasmin", "Al Rawdah", "Al Sahafah", "Diplomatic Quarter", "Al Takhassusi", "Al Malqa"],
    "jeddah": ["Al Balad", "Al Hamra", "Al Rawdah", "Al Andalus", "Al Salamah", "Al Shati", "Al Zahra", "Al Naeem", "Al Faisaliyah", "Al Aziziyah", "Al Bawadi", "Al Safa", "Corniche", "Al Marwah", "Obhur"],
    "mecca": ["Al Aziziyah", "Al Sharai", "Al Naseem", "Al Rusaifah", "Al Hijrah", "Al Zahir", "Al Awali", "Al Kakiyah", "Al Umrah", "Al Nuzha", "Al Adl", "Al Jamiah", "Al Shubaikah", "Al Misfalah", "Al Hamra"],
    "medina": ["Quba", "Al Haram", "Al Anbariyah", "Al Aqiq", "Al Aziziyah", "Al Khalidiyah", "Al Rawabi", "Al Salam", "Al Uyun", "Al Iskan", "Al Difa", "Al Jamiah", "Sultanah", "Al Aridh", "Bani Zafar"],
    "dammam": ["Al Faisaliyah", "Al Shatea", "Al Muhammadiyah", "Al Adamah", "Al Anud", "Al Mazruiyah", "Al Firdous", "Al Rakah", "Al Jalawiyah", "Al Danah", "Al Nada", "Al Hamra", "King Fahd Suburb", "Al Aziziyah", "Uhud"],

    // ----- QATAR -----
    "doha": ["West Bay", "The Pearl", "Lusail", "Al Sadd", "Souq Waqif", "Msheireb", "Al Waab", "Bin Mahmoud", "Al Duhail", "Al Rayyan", "Al Wakra", "Education City", "Katara", "Aspire Zone", "Industrial Area"],

    // ----- OMAN -----
    "muscat": ["Ruwi", "Al Khuwair", "Qurum", "Ghubra", "Madinat Sultan Qaboos", "Mutrah", "Bausher", "Al Mawaleh", "Wadi Kabir", "Azaiba", "Seeb", "Wattayah", "Shatti Al Qurum", "Al Ghubrah", "Amerat"],

    // ----- KUWAIT -----
    "kuwait city": ["Salmiya", "Hawally", "Sharq", "Jabriya", "Salwa", "Mishref", "Bneid Al Qar", "Kuwait City Centre", "Rumaithiya", "Shaab", "Dasma", "Mansouriya", "Adailiya", "Kaifan", "Qadsiya"],

    // ----- BAHRAIN -----
    "manama": ["Adliya", "Juffair", "Seef", "Hoora", "Gudaibiya", "Sanabis", "Bab Al Bahrain", "Salmaniya", "Um Al Hassam", "Mahooz", "Naim", "Zinj", "Diplomatic Area", "Busaiteen", "Manama Souq"],

    // ----- JORDAN -----
    "amman": ["Abdoun", "Sweifieh", "Jabal Amman", "Shmeisani", "Dabouq", "Deir Ghbar", "Khalda", "Tla Al Ali", "Weibdeh", "Rainbow Street", "Marka", "Jabal Al Hussein", "Umm Uthaina", "Al Rabieh", "Downtown"],

    // ----- LEBANON -----
    "beirut": ["Hamra", "Achrafieh", "Gemmayzeh", "Mar Mikhael", "Verdun", "Ras Beirut", "Badaro", "Downtown", "Manara", "Sodeco", "Furn El Chebbak", "Ain El Mreisseh", "Clemenceau", "Sassine", "Bourj Hammoud"],

    // ----- ISRAEL -----
    "tel aviv": ["Florentin", "Neve Tzedek", "Rothschild", "Jaffa", "Ramat Aviv", "Dizengoff", "Sarona", "Old North", "Kerem HaTeimanim", "Ramat Gan", "Herzliya", "Givatayim", "Bavli", "Yad Eliyahu", "Montefiore"],

    // ============================================================
    //  EUROPE
    // ============================================================

    // ----- UNITED KINGDOM -----
    "london": ["Westminster", "Camden", "Shoreditch", "Canary Wharf", "Soho", "Kensington", "Chelsea", "Brixton", "Islington", "Hackney", "Greenwich", "Stratford", "Croydon", "Richmond", "Wimbledon"],
    "manchester": ["City Centre", "Northern Quarter", "Salford", "Deansgate", "Ancoats", "Didsbury", "Chorlton", "Fallowfield", "Spinningfields", "Castlefield", "Trafford", "Old Trafford", "Prestwich", "Stockport", "Withington"],
    "birmingham": ["City Centre", "Digbeth", "Jewellery Quarter", "Edgbaston", "Moseley", "Harborne", "Selly Oak", "Solihull", "Sutton Coldfield", "Kings Heath", "Bournville", "Erdington", "Aston", "Handsworth", "Small Heath"],
    "leeds": ["City Centre", "Headingley", "Chapel Allerton", "Roundhay", "Hyde Park", "Horsforth", "Kirkstall", "Meanwood", "Armley", "Holbeck", "Morley", "Pudsey", "Otley", "Garforth", "Beeston"],
    "glasgow": ["City Centre", "West End", "Merchant City", "Finnieston", "Shawlands", "Dennistoun", "Partick", "Hillhead", "Govan", "Pollokshields", "Southside", "Byres Road", "Anniesland", "Maryhill", "Kelvinbridge"],
    "edinburgh": ["Old Town", "New Town", "Leith", "Stockbridge", "Morningside", "Bruntsfield", "Marchmont", "Portobello", "Corstorphine", "Newington", "Haymarket", "Grassmarket", "Dean Village", "Tollcross", "Gorgie"],
    "liverpool": ["City Centre", "Baltic Triangle", "Ropewalks", "Georgian Quarter", "Aigburth", "Allerton", "Woolton", "Sefton Park", "Anfield", "Bootle", "Wavertree", "Toxteth", "Kensington", "Crosby", "Everton"],
    "bristol": ["City Centre", "Clifton", "Stokes Croft", "Harbourside", "Bedminster", "Redland", "Montpelier", "Southville", "Bishopston", "Cotham", "St Pauls", "Easton", "Gloucester Road", "Fishponds", "Horfield"],
    "cardiff": ["City Centre", "Cardiff Bay", "Cathays", "Roath", "Canton", "Pontcanna", "Grangetown", "Splott", "Llandaff", "Penarth", "Whitchurch", "Adamsdown", "Heath", "Butetown", "Cyncoed"],
    "belfast": ["City Centre", "Cathedral Quarter", "Titanic Quarter", "Queens Quarter", "Botanic", "Shankill", "Falls", "Ormeau", "Stranmillis", "Holywood", "Malone", "Ballymacarrett", "Andersonstown", "Newtownabbey", "Lisburn"],

    // ----- IRELAND -----
    "dublin": ["City Centre", "Temple Bar", "Grand Canal", "Ballsbridge", "Rathmines", "Drumcondra", "Dun Laoghaire", "Sandyford", "Tallaght", "Blanchardstown", "Swords", "Howth", "Clontarf", "Smithfield", "IFSC"],
    "cork": ["City Centre", "Douglas", "Ballintemple", "Blackrock", "Wilton", "Bishopstown", "Montenotte", "Sunday's Well", "Turners Cross", "Mahon", "Ballincollig", "Glanmire", "Togher", "Blackpool", "Grange"],
    "galway": ["City Centre", "Salthill", "Knocknacarra", "Renmore", "Newcastle", "Oranmore", "Barna", "Bohermore", "Menlo", "Rahoon", "Ballybane", "Terryland", "Claddagh", "Shantalla", "Doughiska"],

    // ----- FRANCE -----
    "paris": ["Le Marais", "Montmartre", "Champs-Elysees", "Saint-Germain", "Bastille", "La Defense", "Belleville", "Oberkampf", "Pigalle", "Opera", "Republique", "Neuilly", "Boulogne", "Montparnasse", "Nation"],
    "lyon": ["Presqu'ile", "Vieux Lyon", "Croix-Rousse", "Part-Dieu", "Confluence", "Guillotiere", "Villeurbanne", "Brotteaux", "Fourviere", "Gerland", "Monplaisir", "Bellecour", "Terreaux", "Vaise", "Montchat"],
    "marseille": ["Vieux-Port", "Le Panier", "La Joliette", "Castellane", "Prado", "Endoume", "La Plaine", "Cours Julien", "Notre-Dame du Mont", "La Corniche", "Longchamp", "Vauban", "Les Goudes", "Estaque", "Bonneveine"],
    "nice": ["Vieux Nice", "Promenade des Anglais", "Cimiez", "Le Port", "Liberation", "Musiciens", "Carre d'Or", "Riquier", "Fabron", "Magnan", "Saint-Roch", "Gambetta", "Jean Medecin", "Nice Nord", "Mont Boron"],
    "toulouse": ["Capitole", "Saint-Cyprien", "Carmes", "Saint-Etienne", "Jean Jaures", "Compans", "Minimes", "Croix-Daurade", "Rangueil", "Purpan", "Saint-Michel", "Arnaud Bernard", "Les Chalets", "Empalot", "Borderouge"],
    "bordeaux": ["Saint-Pierre", "Chartrons", "Saint-Michel", "Bastide", "Victoire", "Caudéran", "Nansouty", "Les Capucins", "Saint-Seurin", "Grand Parc", "Bacalan", "Meriadeck", "Saint-Genes", "Pey-Berland", "Cauderan"],

    // ----- GERMANY -----
    "berlin": ["Mitte", "Kreuzberg", "Prenzlauer Berg", "Friedrichshain", "Charlottenburg", "Neukolln", "Schoneberg", "Wedding", "Tempelhof", "Spandau", "Steglitz", "Wilmersdorf", "Moabit", "Lichtenberg", "Pankow"],
    "munich": ["Altstadt", "Schwabing", "Maxvorstadt", "Haidhausen", "Glockenbachviertel", "Bogenhausen", "Sendling", "Neuhausen", "Giesing", "Lehel", "Westend", "Au", "Pasing", "Moosach", "Trudering"],
    "frankfurt": ["Innenstadt", "Sachsenhausen", "Bornheim", "Westend", "Nordend", "Bockenheim", "Ostend", "Gallus", "Niederrad", "Hochst", "Eschersheim", "Bahnhofsviertel", "Riederwald", "Praunheim", "Rodelheim"],
    "hamburg": ["Altstadt", "St Pauli", "Sternschanze", "Altona", "Eimsbuttel", "Ottensen", "St Georg", "HafenCity", "Winterhude", "Eppendorf", "Blankenese", "Wandsbek", "Barmbek", "Harburg", "Rotherbaum"],
    "cologne": ["Innenstadt", "Altstadt", "Ehrenfeld", "Sudstadt", "Belgisches Viertel", "Deutz", "Nippes", "Lindenthal", "Kalk", "Sulz", "Rodenkirchen", "Mulheim", "Chorweiler", "Neustadt", "Zollstock"],
    "stuttgart": ["Mitte", "West", "Sud", "Ost", "Nord", "Bad Cannstatt", "Vaihingen", "Feuerbach", "Degerloch", "Zuffenhausen", "Botnang", "Mohringen", "Untertürkheim", "Wangen", "Stammheim"],
    "dusseldorf": ["Altstadt", "Medienhafen", "Pempelfort", "Oberkassel", "Flingern", "Bilk", "Friedrichstadt", "Derendorf", "Unterbilk", "Carlstadt", "Golzheim", "Gerresheim", "Kaiserswerth", "Stockum", "Benrath"],
    "leipzig": ["Zentrum", "Sudvorstadt", "Plagwitz", "Connewitz", "Gohlis", "Schleussig", "Lindenau", "Reudnitz", "Waldstrassenviertel", "Zentrum-Sud", "Neustadt", "Stotteritz", "Volkmarsdorf", "Eutritzsch", "Zentrum-Nord"],

    // ----- NETHERLANDS -----
    "amsterdam": ["Centrum", "De Pijp", "Jordaan", "Oud-West", "Oud-Zuid", "Noord", "Oost", "Zuidas", "Amstelveen", "Diemen", "Haarlem", "Bijlmer", "Plantage", "Westpoort", "IJburg"],
    "rotterdam": ["Centrum", "Kop van Zuid", "Delfshaven", "Kralingen", "Blijdorp", "Hillegersberg", "Katendrecht", "Cool", "Noord", "Feijenoord", "Charlois", "Oude Noorden", "Lombardijen", "Prinsenland", "Overschie"],
    "the hague": ["Centrum", "Scheveningen", "Zeeheldenkwartier", "Archipelbuurt", "Bezuidenhout", "Statenkwartier", "Voorburg", "Laak", "Loosduinen", "Segbroek", "Escamp", "Benoordenhout", "Duinoord", "Regentessekwartier", "Ypenburg"],
    "utrecht": ["Binnenstad", "Oost", "Wittevrouwen", "Lombok", "Vogelenbuurt", "Wilhelminapark", "Overvecht", "Leidsche Rijn", "Zuilen", "Tuindorp", "Lunetten", "Kanaleneiland", "Hoograven", "Voordorp", "Rivierenwijk"],

    // ----- BELGIUM -----
    "brussels": ["City Centre", "Ixelles", "Saint-Gilles", "Uccle", "Etterbeek", "Schaerbeek", "Anderlecht", "Woluwe", "Forest", "Molenbeek", "Jette", "Auderghem", "Laeken", "Evere", "Watermael"],
    "antwerp": ["Centrum", "Het Zuid", "Eilandje", "Zurenborg", "Berchem", "Borgerhout", "Deurne", "Wilrijk", "Hoboken", "Merksem", "Kiel", "Sint-Andries", "Linkeroever", "Ekeren", "Nieuw Zuid"],

    // ----- SPAIN -----
    "barcelona": ["Eixample", "Gracia", "El Born", "Barceloneta", "Raval", "Sarria", "Poble Sec", "Sant Marti", "Les Corts", "Sants", "Poblenou", "L'Hospitalet", "Badalona", "Sant Cugat", "Diagonal Mar"],
    "madrid": ["Centro", "Salamanca", "Chamberi", "Malasana", "Chueca", "Retiro", "La Latina", "Lavapies", "Chamartin", "Arganzuela", "Tetuan", "Moncloa", "Vallecas", "Carabanchel", "Las Tablas"],
    "valencia": ["Ciutat Vella", "Ruzafa", "El Carmen", "Eixample", "Cabanyal", "Benimaclet", "Malvarrosa", "Campanar", "Patraix", "Algiros", "El Pla del Real", "Extramurs", "Quatre Carreres", "Poblats Maritims", "Jesus"],
    "seville": ["Casco Antiguo", "Triana", "Nervion", "Los Remedios", "Alameda", "Santa Cruz", "Macarena", "El Arenal", "San Bernardo", "Alfalfa", "Bami", "Heliopolis", "El Porvenir", "La Cartuja", "San Julian"],
    "malaga": ["Centro Historico", "Soho", "La Malagueta", "El Palo", "Pedregalejo", "Teatinos", "El Limonar", "La Merced", "Huelin", "Cerrado de Calderon", "Ciudad Jardin", "Carretera de Cadiz", "Bailen-Miraflores", "Churriana", "Puerto de la Torre"],
    "bilbao": ["Casco Viejo", "Abando", "Indautxu", "Deusto", "Santutxu", "Begona", "San Francisco", "Ensanche", "Uribarri", "Basurto", "Rekalde", "Zorrotza", "Otxarkoaga", "Txurdinaga", "Errekaldeberri"],

    // ----- PORTUGAL -----
    "lisbon": ["Baixa", "Alfama", "Bairro Alto", "Belem", "Parque das Nacoes", "Chiado", "Principe Real", "Santos", "Alcantara", "Estrela", "Campo Ourique", "Cais do Sodre", "Graca", "Avenida", "Expo"],
    "porto": ["Ribeira", "Baixa", "Cedofeita", "Foz do Douro", "Boavista", "Bonfim", "Massarelos", "Miragaia", "Campanha", "Aliados", "Vila Nova de Gaia", "Matosinhos", "Paranhos", "Lordelo do Ouro", "Antas"],

    // ----- ITALY -----
    "rome": ["Centro Storico", "Trastevere", "Monti", "Prati", "Testaccio", "Trionfale", "Esquilino", "Parioli", "San Lorenzo", "EUR", "Pigneto", "Ostiense", "Flaminio", "Aventino", "Garbatella"],
    "milan": ["Duomo", "Brera", "Navigli", "Porta Nuova", "Isola", "Citta Studi", "Porta Romana", "Sempione", "Lambrate", "Bicocca", "Porta Venezia", "San Siro", "Garibaldi", "Tortona", "Loreto"],
    "naples": ["Centro Storico", "Chiaia", "Vomero", "Posillipo", "Mergellina", "Spanish Quarter", "Santa Lucia", "Fuorigrotta", "Vergini", "Sanita", "Toledo", "Materdei", "Bagnoli", "Arenella", "San Ferdinando"],
    "turin": ["Centro", "San Salvario", "Crocetta", "Quadrilatero", "Vanchiglia", "Cit Turin", "Aurora", "Borgo Po", "Santa Rita", "San Donato", "Mirafiori", "Vanchiglietta", "Lingotto", "Barriera di Milano", "Pozzo Strada"],
    "florence": ["Centro Storico", "Oltrarno", "Santa Croce", "San Marco", "Santo Spirito", "Campo di Marte", "Le Cure", "Novoli", "San Frediano", "Gavinana", "Rifredi", "Isolotto", "Careggi", "Santa Maria Novella", "San Niccolo"],
    "bologna": ["Centro Storico", "Santo Stefano", "Bolognina", "San Donato", "Saragozza", "Porto", "Murri", "San Vitale", "Navile", "Costa Saragozza", "Mazzini", "Corticella", "Barca", "Cirenaica", "Pratello"],

    // ----- AUSTRIA -----
    "vienna": ["Innere Stadt", "Leopoldstadt", "Landstrasse", "Mariahilf", "Neubau", "Wieden", "Josefstadt", "Alsergrund", "Favoriten", "Dobling", "Hietzing", "Ottakring", "Floridsdorf", "Margareten", "Simmering"],

    // ----- SWITZERLAND -----
    "zurich": ["Altstadt", "Enge", "Wiedikon", "Aussersihl", "Oerlikon", "Seefeld", "Wollishofen", "Hottingen", "Affoltern", "Hongg", "Witikon", "Albisrieden", "Schwamendingen", "Fluntern", "Wipkingen"],
    "geneva": ["Centre", "Eaux-Vives", "Plainpalais", "Paquis", "Carouge", "Champel", "Servette", "Cornavin", "Petit-Saconnex", "Grottes", "Jonction", "Charmilles", "Malagnou", "Acacias", "Vernier"],
    "basel": ["Altstadt", "Kleinbasel", "Grossbasel", "Gundeldingen", "St Johann", "Wettstein", "Breite", "Bachletten", "Gotthelf", "Iselin", "Am Ring", "Clara", "Matthaus", "Rosental", "Bruderholz"],

    // ----- DENMARK -----
    "copenhagen": ["Indre By", "Norrebro", "Vesterbro", "Osterbro", "Frederiksberg", "Christianshavn", "Amager", "Valby", "Nordhavn", "Sydhavn", "Islands Brygge", "Kongens Nytorv", "Norrebro Park", "Vanlose", "Bronshoj"],
    "aarhus": ["Midtbyen", "Aarhus C", "Frederiksbjerg", "Trojborg", "Latinerkvarteret", "Vesterbro", "Risskov", "Viby", "Hojbjerg", "Skejby", "Braband", "Aabyhoj", "Egaa", "Lystrup", "Norrebro"],

    // ----- SWEDEN -----
    "stockholm": ["Gamla Stan", "Sodermalm", "Ostermalm", "Norrmalm", "Vasastan", "Kungsholmen", "Djurgarden", "Solna", "Sundbyberg", "Bromma", "Hammarby Sjostad", "Liljeholmen", "Nacka", "Taby", "Sodra"],
    "malmo": ["Gamla Staden", "Vastra Hamnen", "Mollevangen", "Sodervarn", "Limhamn", "Rosengard", "Hyllie", "Davidshall", "Slottsstaden", "Ribersborg", "Augustenborg", "Kirseberg", "Fosie", "Varnhem", "Bunkeflostrand"],
    "gothenburg": ["Centrum", "Haga", "Linne", "Majorna", "Vasastan", "Avenyn", "Hisingen", "Ostermalm", "Nordstan", "Johanneberg", "Lindholmen", "Guldheden", "Masthugget", "Ganne", "Kortedala"],

    // ----- NORWAY -----
    "oslo": ["Sentrum", "Grunerlokka", "Frogner", "Majorstuen", "St Hanshaugen", "Gamle Oslo", "Sagene", "Aker Brygge", "Bjorvika", "Gronland", "Toyen", "Bislett", "Ullevaal", "Nordre Aker", "Sagene"],
    "bergen": ["Sentrum", "Bryggen", "Nordnes", "Sandviken", "Landas", "Fana", "Aasane", "Fyllingsdalen", "Laksevag", "Minde", "Kalfaret", "Nygard", "Skansen", "Nattland", "Loddefjord"],

    // ----- FINLAND -----
    "helsinki": ["Kamppi", "Kallio", "Punavuori", "Toolo", "Eira", "Kruununhaka", "Ullanlinna", "Sornainen", "Vallila", "Katajanokka", "Lauttasaari", "Pasila", "Munkkiniemi", "Kaartinkaupunki", "Hakaniemi"],

    // ----- ICELAND -----
    "reykjavik": ["Downtown", "Laugavegur", "Vesturbaer", "Grafarvogur", "Breidholt", "Arbaer", "Hlidar", "Grandi", "Kopavogur", "Hafnarfjordur", "Seltjarnarnes", "Laugardalur", "Miobaer", "Fossvogur", "Grafarholt"],

    // ----- POLAND -----
    "warsaw": ["Srodmiescie", "Mokotow", "Praga", "Wola", "Zoliborz", "Ochota", "Ursynow", "Wilanow", "Bemowo", "Bielany", "Wlochy", "Targowek", "Bialoleka", "Wawer", "Ursus"],
    "krakow": ["Old Town", "Kazimierz", "Podgorze", "Nowa Huta", "Zwierzyniec", "Grzegorzki", "Krowodrza", "Debniki", "Salwator", "Bronowice", "Ludwinow", "Pradnik", "Wola Justowska", "Zablocie", "Czyzyny"],
    "wroclaw": ["Old Town", "Nadodrze", "Krzyki", "Srodmiescie", "Oltaszyn", "Biskupin", "Sepolno", "Psie Pole", "Fabryczna", "Grabiszyn", "Karlowice", "Zacisze", "Klecina", "Gaj", "Brochow"],
    "gdansk": ["Old Town", "Wrzeszcz", "Oliwa", "Przymorze", "Zaspa", "Sopot", "Gdynia", "Nowy Port", "Brzezno", "Jelitkowo", "Morena", "Chelm", "Zabianka", "Orunia", "Siedlce"],
    "poznan": ["Stare Miasto", "Jezyce", "Wilda", "Lazarz", "Grunwald", "Winogrady", "Rataje", "Naramowice", "Sotacz", "Debiec", "Gorczyn", "Piatkowo", "Malta", "Wildecki", "Nowe Miasto"],

    // ----- CZECH REPUBLIC -----
    "prague": ["Stare Mesto", "Nove Mesto", "Mala Strana", "Vinohrady", "Zizkov", "Smichov", "Holesovice", "Karlin", "Vrsovice", "Dejvice", "Nusle", "Liben", "Branik", "Vysocany", "Modrany"],

    // ----- HUNGARY -----
    "budapest": ["District V", "District VI", "District VII", "District VIII", "District IX", "District XIII", "District I", "District II", "District XI", "Buda", "Pest", "Obuda", "Ujpest", "Zuglo", "Kelenfold"],

    // ----- ROMANIA -----
    "bucharest": ["Old Town", "Sector 1", "Herastrau", "Dorobanti", "Cotroceni", "Floreasca", "Pipera", "Aviatorilor", "Unirii", "Universitate", "Baneasa", "Militari", "Titan", "Berceni", "Drumul Taberei"],

    // ----- BULGARIA -----
    "sofia": ["Centre", "Lozenets", "Mladost", "Studentski Grad", "Vitosha", "Ivan Vazov", "Oborishte", "Doktorska Gradina", "Sredets", "Krasno Selo", "Boyana", "Dianabad", "Nadezhda", "Lyulin", "Manastirski Livadi"],

    // ----- SERBIA -----
    "belgrade": ["Stari Grad", "Vracar", "Dorcol", "Savamala", "Zemun", "Novi Beograd", "Vozdovac", "Zvezdara", "Dedinje", "Banovo Brdo", "Cukarica", "Palilula", "Senjak", "Rakovica", "Skadarlija"],

    // ----- CROATIA -----
    "zagreb": ["Gornji Grad", "Donji Grad", "Tresnjevka", "Maksimir", "Trnje", "Novi Zagreb", "Medvescak", "Britanac", "Kaptol", "Jarun", "Dubrava", "Pescenica", "Cvjetni", "Knezija", "Sesvete"],
    "split": ["Old Town", "Bacvice", "Varos", "Meje", "Znjan", "Firule", "Spinut", "Manus", "Lokve", "Blatine", "Skalice", "Gripe", "Sukoisan", "Ravne Njive", "Trstenik"],

    // ----- SLOVENIA -----
    "ljubljana": ["Center", "Trnovo", "Vic", "Bezigrad", "Siska", "Moste", "Rozna Dolina", "Poljane", "Krakovo", "Tabor", "Spica", "Dravlje", "Fuzine", "Sentvid", "Kodeljevo"],

    // ----- SLOVAKIA -----
    "bratislava": ["Stare Mesto", "Petrzalka", "Ruzinov", "Nove Mesto", "Karlova Ves", "Dubravka", "Raca", "Vajnory", "Lamac", "Devin", "Podunajske Biskupice", "Vrakuna", "Jarovce", "Rusovce", "Zahorska Bystrica"],

    // ----- ESTONIA -----
    "tallinn": ["Old Town", "Kalamaja", "Kadriorg", "Kesklinn", "Pirita", "Rotermann", "Telliskivi", "Lasnamae", "Mustamae", "Nomme", "Kristiine", "Ulemiste", "Pohja-Tallinn", "Haabersti", "Vanalinn"],

    // ----- LATVIA -----
    "riga": ["Old Town", "Centrs", "Agenskalns", "Teika", "Purvciems", "Mezaparks", "Kipsala", "Sarkandaugava", "Bolderaja", "Imanta", "Ziepniekkalns", "Centraltirgus", "Grizinkalns", "Torakalns", "Vecmilgravis"],

    // ----- LITHUANIA -----
    "vilnius": ["Old Town", "Uzupis", "Naujamiestis", "Zverynas", "Antakalnis", "Zirmunai", "Pilaite", "Fabijoniskes", "Karoliniskes", "Sniuipiskes", "Lazdynai", "Justiniskes", "Baltupiai", "Verkiai", "Zaliakalnis"],

    // ----- UKRAINE -----
    "kyiv": ["Pechersk", "Podil", "Shevchenkivskyi", "Obolon", "Pozniaky", "Holosiivskyi", "Lypky", "Troieschyna", "Solomianka", "Darnytsia", "Vozdvyzhenka", "Osokorky", "Nyvky", "Rusanivka", "Dorohozhychi"],

    // ----- GREECE -----
    "athens": ["Plaka", "Kolonaki", "Monastiraki", "Psiri", "Exarchia", "Koukaki", "Glyfada", "Kifisia", "Pangrati", "Gazi", "Petralona", "Marousi", "Nea Smyrni", "Piraeus", "Thiseio"],
    "thessaloniki": ["Ladadika", "Ano Poli", "Kalamaria", "Toumba", "Ampelokipoi", "Harilaou", "Kamara", "Ntepo", "Aristotelous", "Faliro", "Evosmos", "Panorama", "Pylaia", "Neapoli", "Sykies"],

    // ----- LUXEMBOURG -----
    "luxembourg": ["Ville Haute", "Grund", "Clausen", "Kirchberg", "Gare", "Limpertsberg", "Belair", "Bonnevoie", "Hollerich", "Cents", "Merl", "Gasperich", "Cessange", "Weimerskirch", "Pfaffenthal"],

    // ----- TURKEY -----
    "istanbul": ["Beyoglu", "Kadikoy", "Besiktas", "Sisli", "Fatih", "Uskudar", "Bakirkoy", "Sariyer", "Maltepe", "Atasehir", "Beylikduzu", "Eyup", "Bahcelievler", "Pendik", "Levent"],

    // ============================================================
    //  AFRICA
    // ============================================================

    // ----- EGYPT -----
    "cairo": ["Zamalek", "Maadi", "Heliopolis", "Nasr City", "Downtown", "Dokki", "Mohandessin", "Garden City", "New Cairo", "6th October", "Giza", "Shubra", "Agouza", "Sheikh Zayed", "Rehab"],

    // ----- MOROCCO -----
    "casablanca": ["Maarif", "Gauthier", "Anfa", "Racine", "Ain Diab", "Bourgogne", "Habous", "Sidi Belyout", "Oasis", "Bourgogne", "Belvedere", "Ain Sebaa", "Sidi Maarouf", "Californie", "CIL"],
    "marrakech": ["Medina", "Gueliz", "Hivernage", "Palmeraie", "Sidi Ghanem", "Kasbah", "Mellah", "Agdal", "Targa", "Semlalia", "Daoudiate", "Massira", "Amerchich", "Bab Doukkala", "Mabrouka"],
    "rabat": ["Agdal", "Hassan", "Hay Riad", "Souissi", "Ocean", "Medina", "Yacoub El Mansour", "Aviation", "Orangeraie", "Diour Jamaa", "Akkari", "Al Irfane", "Takaddoum", "Kasbah des Oudayas", "Touarga"],

    // ----- TUNISIA -----
    "tunis": ["Medina", "La Marsa", "Carthage", "Sidi Bou Said", "Lac 1", "Lac 2", "El Menzah", "Ariana", "Bardo", "La Goulette", "Manar", "Mutuelleville", "Ennasr", "Belvedere", "Montplaisir"],

    // ----- ALGERIA -----
    "algiers": ["Bab El Oued", "Hydra", "El Biar", "Kouba", "Bir Mourad Rais", "Ben Aknoun", "Dely Ibrahim", "Cheraga", "Hussein Dey", "El Madania", "Bab Ezzouar", "Kasbah", "Sidi Yahia", "Bologhine", "Belouizdad"],

    // ----- KENYA -----
    "nairobi": ["Westlands", "Karen", "Kilimani", "Upper Hill", "CBD", "Lavington", "Kileleshwa", "Parklands", "Ngong Road", "Lang'ata", "South B", "South C", "Eastleigh", "Kasarani", "Thika Road"],

    // ----- GHANA -----
    "accra": ["Osu", "East Legon", "Cantonments", "Airport Residential", "Labone", "Dansoman", "Tema", "Adabraka", "Dzorwulu", "Achimota", "Spintex", "Ridge", "Roman Ridge", "Tesano", "Madina"],

    // ----- ETHIOPIA -----
    "addis ababa": ["Bole", "Kazanchis", "Piassa", "Sarbet", "Megenagna", "Old Airport", "CMC", "Gerji", "Sar Bet", "Mexico", "Kirkos", "Arat Kilo", "Gurd Shola", "Ayat", "Summit"],

    // ----- NIGERIA -----
    "lagos": ["Victoria Island", "Ikoyi", "Lekki", "Ikeja", "Surulere", "Yaba", "Apapa", "Ajah", "Maryland", "Gbagada", "Festac", "Magodo", "Oshodi", "Ikorodu", "Ojota"],
    "abuja": ["Maitama", "Asokoro", "Wuse", "Garki", "Gwarinpa", "Jabi", "Utako", "Central Business District", "Life Camp", "Lugbe", "Kubwa", "Wuye", "Katampe", "Guzape", "Durumi"],

    // ----- SOUTH AFRICA -----
    "johannesburg": ["Sandton", "Rosebank", "Soweto", "Randburg", "Midrand", "Fourways", "Braamfontein", "Melville", "Parktown", "Bryanston", "Roodepoort", "Centurion", "Maboneng", "Auckland Park", "Houghton"],
    "cape town": ["City Bowl", "Sea Point", "Camps Bay", "Green Point", "Woodstock", "Observatory", "Claremont", "Constantia", "Gardens", "Bellville", "Newlands", "Hout Bay", "Century City", "Muizenberg", "Rondebosch"],
    "durban": ["Umhlanga", "Berea", "Morningside", "Glenwood", "Musgrave", "Ballito", "Westville", "Durban North", "Florida Road", "Point Waterfront", "Overport", "Chatsworth", "Pinetown", "Hillcrest", "La Lucia"],
    "pretoria": ["Hatfield", "Brooklyn", "Menlyn", "Centurion", "Arcadia", "Waterkloof", "Lynnwood", "Sunnyside", "Faerie Glen", "Silver Lakes", "Garsfontein", "Groenkloof", "Moreleta Park", "Wonderboom", "Villieria"],

    // ============================================================
    //  NORTH AMERICA
    // ============================================================

    // ----- UNITED STATES -----
    //   UNITED STATES · Tier 1 (Major Metros)
    "new york": ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Harlem", "SoHo", "Williamsburg", "Long Island City", "Jersey City", "Hoboken", "Newark", "Astoria", "Midtown", "Downtown"],
    "los angeles": ["Hollywood", "Beverly Hills", "Santa Monica", "Pasadena", "Burbank", "Glendale", "Long Beach", "Culver City", "Venice", "West Hollywood", "Downtown LA", "Koreatown", "Silver Lake", "Echo Park", "Inglewood"],
    "chicago": ["Loop", "Lincoln Park", "Wicker Park", "River North", "Gold Coast", "Hyde Park", "Lakeview", "Logan Square", "Evanston", "Oak Park", "Schaumburg", "Naperville", "Bucktown", "Pilsen", "Streeterville"],
    "houston": ["Downtown", "Midtown", "Galleria", "Katy", "Sugar Land", "The Woodlands", "Pearland", "Spring", "Montrose", "Heights", "Memorial", "Energy Corridor", "Clear Lake", "Cy-Fair", "Bellaire"],
    "philadelphia": ["Center City", "Old City", "Fishtown", "Northern Liberties", "University City", "South Philly", "Rittenhouse", "Manayunk", "Fairmount", "Queen Village", "Society Hill", "Chestnut Hill", "Brewerytown", "Kensington", "Germantown"],
    "san francisco": ["Mission District", "SoMa", "Financial District", "Nob Hill", "Chinatown", "Castro", "Haight-Ashbury", "Marina District", "North Beach", "Sunset District", "Richmond District", "Tenderloin", "Pacific Heights", "Hayes Valley", "Potrero Hill"],
    "boston": ["Back Bay", "Beacon Hill", "South End", "North End", "Fenway", "Cambridge", "Somerville", "Charlestown", "Jamaica Plain", "Dorchester", "Brookline", "Allston", "Brighton", "Roxbury", "Seaport"],
    "washington dc": ["Georgetown", "Dupont Circle", "Capitol Hill", "Adams Morgan", "Foggy Bottom", "Navy Yard", "Shaw", "Columbia Heights", "Logan Circle", "U Street", "Petworth", "Anacostia", "Cleveland Park", "NoMa", "Tenleytown"],
    "atlanta": ["Midtown", "Buckhead", "Downtown", "Decatur", "Virginia-Highland", "Old Fourth Ward", "Inman Park", "West Midtown", "Sandy Springs", "Marietta", "Alpharetta", "Brookhaven", "East Atlanta", "Grant Park", "Vinings"],
    "miami": ["South Beach", "Brickell", "Downtown", "Wynwood", "Coral Gables", "Coconut Grove", "Little Havana", "Design District", "Doral", "Aventura", "Kendall", "Miami Beach", "Edgewater", "Midtown", "Hialeah"],
    "dallas": ["Uptown", "Downtown", "Deep Ellum", "Bishop Arts", "Oak Lawn", "Highland Park", "Plano", "Frisco", "Irving", "Richardson", "Addison", "Las Colinas", "Lakewood", "Knox-Henderson", "Trinity Groves"],
    "seattle": ["Capitol Hill", "Ballard", "Fremont", "Queen Anne", "Belltown", "South Lake Union", "University District", "West Seattle", "Georgetown", "Wallingford", "Greenwood", "Columbia City", "Pioneer Square", "Magnolia", "Beacon Hill"],
    //   UNITED STATES · Tier 2
    "san diego": ["Gaslamp Quarter", "La Jolla", "North Park", "Pacific Beach", "Hillcrest", "Little Italy", "Mission Valley", "Ocean Beach", "Coronado", "Chula Vista", "Carlsbad", "Encinitas", "Mission Beach", "Downtown", "Point Loma"],
    "austin": ["Downtown", "South Congress", "East Austin", "Zilker", "Hyde Park", "The Domain", "Mueller", "Westlake", "Round Rock", "Cedar Park", "Barton Hills", "Tarrytown", "Rainey Street", "Clarksville", "Pflugerville"],
    "denver": ["LoDo", "RiNo", "Capitol Hill", "Cherry Creek", "Highlands", "Wash Park", "Five Points", "Baker", "Stapleton", "Aurora", "Lakewood", "Englewood", "Golden", "Glendale", "City Park"],
    "phoenix": ["Downtown", "Scottsdale", "Tempe", "Mesa", "Chandler", "Glendale", "Gilbert", "Arcadia", "Ahwatukee", "Biltmore", "Paradise Valley", "Peoria", "Surprise", "Maryvale", "Sunnyslope"],
    "las vegas": ["The Strip", "Downtown", "Summerlin", "Henderson", "Spring Valley", "Paradise", "Enterprise", "North Las Vegas", "Green Valley", "Centennial Hills", "Chinatown", "Aliante", "Anthem", "Sunrise", "Whitney"],
    "portland": ["Pearl District", "Downtown", "Hawthorne", "Alberta Arts", "Nob Hill", "Sellwood", "Hollywood", "Mississippi", "Division", "Beaverton", "Hillsboro", "Lake Oswego", "St Johns", "Laurelhurst", "Northwest"],
    "san jose": ["Downtown", "Willow Glen", "Santana Row", "Japantown", "Rose Garden", "Almaden", "Evergreen", "Berryessa", "Cambrian", "North San Jose", "Alum Rock", "Blossom Valley", "West San Jose", "Campbell", "Milpitas"],
    "san antonio": ["Downtown", "Alamo Heights", "Southtown", "Pearl District", "Stone Oak", "Medical Center", "Alamo Ranch", "The Dominion", "King William", "Terrell Hills", "Leon Valley", "Universal City", "Helotes", "Boerne", "Schertz"],
    "fort worth": ["Downtown", "Sundance Square", "Cultural District", "Near Southside", "TCU", "West 7th", "Fairmount", "Arlington Heights", "Ridglea", "Alliance", "Keller", "Southlake", "North Richland Hills", "Benbrook", "Haltom City"],
    "sacramento": ["Midtown", "Downtown", "East Sacramento", "Land Park", "Oak Park", "Natomas", "Curtis Park", "Elk Grove", "Roseville", "Folsom", "Arden-Arcade", "Pocket", "Rancho Cordova", "Citrus Heights", "West Sacramento"],
    "columbus": ["Short North", "Downtown", "German Village", "Clintonville", "Arena District", "Dublin", "Grandview", "Westerville", "Upper Arlington", "Bexley", "Hilliard", "Gahanna", "Powell", "Worthington", "Victorian Village"],
    "indianapolis": ["Downtown", "Broad Ripple", "Fountain Square", "Mass Ave", "Meridian-Kessler", "Carmel", "Fishers", "Irvington", "Nora", "Castleton", "Speedway", "Zionsville", "Greenwood", "Lawrence", "Beech Grove"],
    "charlotte": ["Uptown", "South End", "NoDa", "Plaza Midwood", "Dilworth", "Ballantyne", "University City", "Myers Park", "SouthPark", "Elizabeth", "Matthews", "Huntersville", "Cornelius", "Steele Creek", "Cotswold"],
    "nashville": ["Downtown", "The Gulch", "East Nashville", "Germantown", "Midtown", "12 South", "Green Hills", "Music Row", "Sylvan Park", "Belmont", "Franklin", "Brentwood", "Berry Hill", "Donelson", "Bellevue"],
    "detroit": ["Downtown", "Midtown", "Corktown", "Greektown", "Eastern Market", "Royal Oak", "Ferndale", "Dearborn", "Grosse Pointe", "New Center", "Rivertown", "Southwest", "Birmingham", "Troy", "Livonia"],
    "minneapolis": ["Downtown", "Uptown", "North Loop", "Northeast", "Dinkytown", "Linden Hills", "St Paul", "Edina", "Bloomington", "Whittier", "Longfellow", "Powderhorn", "Nokomis", "St Louis Park", "Richfield"],
    "baltimore": ["Inner Harbor", "Fells Point", "Federal Hill", "Canton", "Mount Vernon", "Hampden", "Locust Point", "Harbor East", "Charles Village", "Towson", "Roland Park", "Fort McHenry", "Station North", "Remington", "Pikesville"],
    "orlando": ["Downtown", "Winter Park", "Lake Nona", "Thornton Park", "College Park", "Dr Phillips", "Baldwin Park", "Mills 50", "Windermere", "Winter Garden", "Kissimmee", "Altamonte Springs", "Lake Eola", "Ivanhoe Village", "Celebration"],
    "tampa": ["Downtown", "Ybor City", "Hyde Park", "Channelside", "SoHo", "Seminole Heights", "Westshore", "Davis Islands", "Brandon", "Riverview", "St Petersburg", "Clearwater", "New Tampa", "Palma Ceia", "Carrollwood"],
    //   UNITED STATES · Tier 3
    "memphis": ["Downtown", "Midtown", "Cooper-Young", "East Memphis", "Germantown", "Collierville", "Bartlett", "Overton Square", "Harbor Town", "South Main", "Cordova", "Whitehaven", "Frayser", "Binghampton", "Orange Mound"],
    "kansas city": ["Downtown", "Crossroads", "Westport", "Country Club Plaza", "River Market", "Brookside", "Waldo", "Power and Light", "Midtown", "Overland Park", "Lenexa", "Independence", "Lee's Summit", "North KC", "Prairie Village"],
    "st louis": ["Downtown", "Central West End", "The Grove", "Soulard", "Clayton", "The Hill", "Delmar Loop", "Lafayette Square", "Tower Grove", "Kirkwood", "Chesterfield", "University City", "Webster Groves", "Maplewood", "Cherokee Street"],
    "cleveland": ["Downtown", "Ohio City", "Tremont", "University Circle", "Detroit-Shoreway", "Lakewood", "Shaker Heights", "Little Italy", "Gordon Square", "Cleveland Heights", "Rocky River", "Westlake", "Beachwood", "Coventry", "Battery Park"],
    "pittsburgh": ["Downtown", "Strip District", "Lawrenceville", "Shadyside", "Squirrel Hill", "Oakland", "South Side", "East Liberty", "Bloomfield", "Mount Washington", "North Shore", "Regent Square", "Bellevue", "Sewickley", "Fox Chapel"],
    "cincinnati": ["Over-the-Rhine", "Downtown", "Hyde Park", "Oakley", "Mount Adams", "Clifton", "Northside", "Covington", "Newport", "Mason", "West Chester", "Blue Ash", "Montgomery", "Norwood", "Walnut Hills"],
    "milwaukee": ["Downtown", "Third Ward", "Bay View", "Walker's Point", "Riverwest", "East Side", "Wauwatosa", "Brookfield", "Shorewood", "Bronzeville", "Brewers Hill", "West Allis", "Mequon", "Cudahy", "Whitefish Bay"],
    "jacksonville": ["Downtown", "Riverside", "San Marco", "Avondale", "Springfield", "Jacksonville Beach", "Southside", "Mandarin", "Arlington", "Ortega", "Baymeadows", "Atlantic Beach", "Neptune Beach", "Murray Hill", "Ponte Vedra"],
    "new orleans": ["French Quarter", "Garden District", "Marigny", "Bywater", "Uptown", "Warehouse District", "Treme", "Mid-City", "Central Business District", "Algiers", "Lakeview", "Bayou St John", "Irish Channel", "Carrollton", "Metairie"],
    "salt lake city": ["Downtown", "Sugar House", "The Avenues", "9th and 9th", "Marmalade", "Liberty Wells", "Rose Park", "Millcreek", "Holladay", "Sandy", "Draper", "West Valley", "Cottonwood Heights", "Central City", "Foothill"],
    "oklahoma city": ["Bricktown", "Downtown", "Midtown", "Plaza District", "Automobile Alley", "Paseo", "Nichols Hills", "Edmond", "Norman", "Moore", "Deep Deuce", "Uptown 23rd", "Yukon", "Bethany", "Mustang"],
    "raleigh": ["Downtown", "North Hills", "Glenwood South", "Cameron Village", "Five Points", "Warehouse District", "Cary", "Apex", "Brier Creek", "Midtown", "Oakwood", "Boylan Heights", "Morrisville", "Wake Forest", "Holly Springs"],

    // ----- CANADA -----
    "toronto": ["North York", "Scarborough", "Etobicoke", "Mississauga", "Brampton", "Markham", "Richmond Hill", "Vaughan", "Downtown", "Yorkville", "Liberty Village", "The Annex", "Kensington", "Queen West", "Beaches"],
    "vancouver": ["Burnaby", "Richmond", "Surrey", "North Vancouver", "West Vancouver", "Coquitlam", "Downtown", "Kitsilano", "Gastown", "Yaletown", "Mount Pleasant", "Commercial Drive", "Metrotown", "New Westminster", "Langley"],
    "montreal": ["Downtown", "Old Montreal", "Plateau", "Mile End", "Griffintown", "Westmount", "Verdun", "Saint-Henri", "Outremont", "Rosemont", "Ville-Marie", "NDG", "Laval", "Longueuil", "Hochelaga"],
    "ottawa": ["ByWard Market", "Downtown", "Centretown", "The Glebe", "Westboro", "Kanata", "Nepean", "Orleans", "Hintonburg", "Sandy Hill", "Old Ottawa South", "Barrhaven", "Vanier", "Gatineau", "Rockcliffe"],
    "calgary": ["Downtown", "Kensington", "Inglewood", "Beltline", "Mission", "Hillhurst", "Bridgeland", "Marda Loop", "Eau Claire", "Bowness", "Mount Royal", "Sunnyside", "Ramsay", "Forest Lawn", "Airdrie"],
    "edmonton": ["Downtown", "Old Strathcona", "Whyte Avenue", "Oliver", "Garneau", "Jasper Avenue", "Bonnie Doon", "Windermere", "Sherwood Park", "St Albert", "Mill Woods", "Riverbend", "Glenora", "Beverly", "Terwillegar"],
    "winnipeg": ["Downtown", "Exchange District", "Osborne Village", "St Boniface", "Corydon", "Wolseley", "West End", "Transcona", "Fort Garry", "St Vital", "River Heights", "Charleswood", "Tuxedo", "North End", "St James"],
    "quebec city": ["Old Quebec", "Saint-Roch", "Montcalm", "Limoilou", "Sainte-Foy", "Saint-Jean-Baptiste", "Vieux-Port", "Sillery", "Charlesbourg", "Beauport", "Lebourgneuf", "Cap-Rouge", "Vanier", "Petit Champlain", "Saint-Sauveur"],
    "halifax": ["Downtown", "North End", "South End", "Dartmouth", "Spring Garden", "Quinpool", "Bedford", "Clayton Park", "Hydrostone", "Fairview", "Sackville", "West End", "Point Pleasant", "Burnside", "Cole Harbour"],
    "hamilton": ["Downtown", "Ancaster", "Dundas", "Stoney Creek", "Westdale", "Waterdown", "Hamilton Mountain", "Hess Village", "Bartonville", "Binbrook", "Glanbrook", "Flamborough", "Corktown", "Kirkendall", "Barton Street"],
    "kitchener": ["Downtown", "Waterloo", "Uptown Waterloo", "Cambridge", "Doon", "Forest Heights", "Bridgeport", "Stanley Park", "Victoria Park", "Huron Village", "Laurentian Hills", "Fairview", "Pioneer Park", "Grand River", "Idlewood"],
    "victoria": ["Downtown", "Oak Bay", "Fairfield", "James Bay", "Fernwood", "Saanich", "Esquimalt", "Cook Street Village", "Cadboro Bay", "Gordon Head", "View Royal", "Vic West", "Rockland", "Langford", "Sidney"],
    "saskatoon": ["Downtown", "Nutana", "Riversdale", "Broadway", "Stonebridge", "Sutherland", "Lawson Heights", "University Heights", "Willowgrove", "Evergreen", "Silverspring", "College Park", "Confederation", "Rosewood", "Brighton"],
    "regina": ["Downtown", "Cathedral", "Harbour Landing", "Lakeview", "Wascana View", "Whitmore Park", "Normanview", "Hillsdale", "Albert Park", "Eastview", "Rosemont", "Glencairn", "Walsh Acres", "University Park", "Regent Park"],
    "windsor": ["Downtown", "Walkerville", "South Windsor", "Riverside", "Sandwich", "LaSalle", "Tecumseh", "Forest Glade", "Devonshire", "East Windsor", "Remington Park", "Fontainebleau", "Roseland", "Amherstburg", "Ford City"],
    "kelowna": ["Downtown", "Rutland", "Mission", "Glenmore", "West Kelowna", "Lake Country", "Black Mountain", "Dilworth", "Kettle Valley", "Peachland", "Upper Mission", "Lower Mission", "Ellison", "South Pandosy", "Clifton"],
    "st johns": ["Downtown", "Mount Pearl", "Paradise", "Torbay", "Quidi Vidi", "Georgestown", "Churchill Square", "Kenmount", "Airport Heights", "Cowan Heights", "Kilbride", "Goulds", "Shea Heights", "Rabbittown", "Pippy Park"],
    "barrie": ["Downtown", "Allandale", "Painswick", "Ardagh", "Holly", "Letitia Heights", "Sunnidale", "Cundles East", "Bayfield", "Innishore", "East End", "South End", "Little Lake", "Georgian", "Wellington"],
    "guelph": ["Downtown", "Exhibition Park", "The Ward", "Old University", "Kortright Hills", "Clairfields", "Grange Hill", "Sunny Acres", "Waverley", "Riverside", "Willow West", "Two Rivers", "Onward Willow", "June Avenue", "Hanlon Creek"],

    // ----- MEXICO -----
    "mexico city": ["Polanco", "Roma Norte", "Condesa", "Santa Fe", "Coyoacan", "Reforma", "Centro Historico", "Zona Rosa", "Del Valle", "Narvarte", "Xochimilco", "Tlalpan", "Insurgentes", "Lomas de Chapultepec", "Naucalpan"],
    "guadalajara": ["Centro", "Zapopan", "Chapultepec", "Providencia", "Americana", "Tlaquepaque", "Tonala", "Andares", "Country Club", "Ladron de Guevara", "Minerva", "Santa Tere", "Colomos", "Jardines del Bosque", "Tlajomulco"],
    "monterrey": ["Centro", "San Pedro", "Valle Oriente", "Cumbres", "Contry", "Del Valle", "Obispado", "Tecnologico", "Mitras", "Guadalupe", "San Nicolas", "Escobedo", "Apodaca", "Santa Catarina", "Fundadores"],

    // ============================================================
    //  SOUTH & CENTRAL AMERICA
    // ============================================================

    // ----- BRAZIL -----
    "sao paulo": ["Paulista", "Pinheiros", "Vila Madalena", "Moema", "Itaim Bibi", "Brooklin", "Vila Olimpia", "Jardins", "Centro", "Liberdade", "Bela Vista", "Consolacao", "Santana", "Tatuape", "ABC Region"],
    "rio de janeiro": ["Copacabana", "Ipanema", "Leblon", "Barra da Tijuca", "Botafogo", "Centro", "Flamengo", "Santa Teresa", "Lapa", "Tijuca", "Gavea", "Jardim Botanico", "Laranjeiras", "Recreio", "Urca"],
    "brasilia": ["Asa Sul", "Asa Norte", "Lago Sul", "Lago Norte", "Sudoeste", "Aguas Claras", "Taguatinga", "Guara", "Setor Comercial", "Setor Hoteleiro", "Cruzeiro", "Ceilandia", "Noroeste", "Park Way", "Octogonal"],
    "curitiba": ["Centro", "Batel", "Agua Verde", "Bigorrilho", "Cabral", "Juveve", "Ecoville", "Portao", "Santa Felicidade", "Cristo Rei", "Merces", "Reboucas", "Alto da XV", "Boa Vista", "Champagnat"],

    // ----- ARGENTINA -----
    "buenos aires": ["Palermo", "Recoleta", "San Telmo", "Puerto Madero", "Belgrano", "Caballito", "Villa Crespo", "Almagro", "Retiro", "Microcentro", "Nunez", "Flores", "Boedo", "La Boca", "Colegiales"],

    // ----- COLOMBIA -----
    "bogota": ["La Candelaria", "Chapinero", "Zona Rosa", "Usaquen", "Chico", "Teusaquillo", "Zona T", "Cedritos", "Salitre", "Suba", "Kennedy", "La Macarena", "Parkway", "Rosales", "Santa Barbara"],
    "medellin": ["El Poblado", "Laureles", "Envigado", "Belen", "La Candelaria", "Sabaneta", "Estadio", "Robledo", "Buenos Aires", "Manrique", "Provenza", "Ciudad del Rio", "Conquistadores", "El Centro", "Itagui"],

    // ----- PERU -----
    "lima": ["Miraflores", "Barranco", "San Isidro", "Surco", "La Molina", "San Borja", "Jesus Maria", "Magdalena", "Pueblo Libre", "Chorrillos", "San Miguel", "Lince", "Cercado de Lima", "Callao", "La Victoria"],

    // ----- CHILE -----
    "santiago": ["Providencia", "Las Condes", "Vitacura", "Bellavista", "Nunoa", "Lastarria", "Santiago Centro", "La Reina", "Barrio Italia", "Recoleta", "Maipu", "La Florida", "Estacion Central", "Penalolen", "Huechuraba"],

    // ----- URUGUAY -----
    "montevideo": ["Ciudad Vieja", "Pocitos", "Punta Carretas", "Centro", "Cordon", "Parque Rodo", "Carrasco", "Buceo", "Malvin", "Tres Cruces", "Aguada", "Prado", "Punta Gorda", "La Blanqueada", "Palermo"],

    // ----- ECUADOR -----
    "quito": ["La Mariscal", "La Floresta", "Centro Historico", "Cumbaya", "La Carolina", "Gonzalez Suarez", "El Batan", "La Pradera", "Guapulo", "El Condado", "Bellavista", "La Vicentina", "Iñaquito", "Tumbaco", "Quito Tenis"],

    // ----- PANAMA -----
    "panama city": ["Casco Viejo", "Punta Pacifica", "El Cangrejo", "Costa del Este", "San Francisco", "Marbella", "Obarrio", "Bella Vista", "Punta Paitilla", "Amador", "Albrook", "Clayton", "El Dorado", "Betania", "Balboa"],

    // ============================================================
    //  OCEANIA
    // ============================================================

    // ----- AUSTRALIA -----
    "sydney": ["CBD", "Bondi", "Surry Hills", "Newtown", "Parramatta", "Manly", "Chatswood", "North Sydney", "Darlinghurst", "Pyrmont", "Redfern", "Barangaroo", "Homebush", "Bankstown", "Penrith"],
    "melbourne": ["CBD", "South Yarra", "Fitzroy", "St Kilda", "Richmond", "Carlton", "Brunswick", "Southbank", "Docklands", "Collingwood", "Prahran", "Footscray", "Box Hill", "Dandenong", "Chadstone"],
    "brisbane": ["CBD", "Fortitude Valley", "South Bank", "West End", "New Farm", "Paddington", "Newstead", "Teneriffe", "Woolloongabba", "Milton", "Kangaroo Point", "Toowong", "Chermside", "Indooroopilly", "Bulimba"],
    "perth": ["CBD", "Northbridge", "Fremantle", "Subiaco", "Leederville", "Cottesloe", "Scarborough", "Joondalup", "Mount Lawley", "Victoria Park", "Claremont", "Nedlands", "Cannington", "Midland", "Applecross"],
    "adelaide": ["CBD", "North Adelaide", "Glenelg", "Norwood", "Unley", "Prospect", "Port Adelaide", "Henley Beach", "Burnside", "Semaphore", "Mawson Lakes", "Kent Town", "Hindmarsh", "Brighton", "Marion"],
    "gold coast": ["Surfers Paradise", "Broadbeach", "Southport", "Burleigh Heads", "Main Beach", "Robina", "Coolangatta", "Palm Beach", "Mermaid Beach", "Currumbin", "Nerang", "Miami", "Nobby Beach", "Varsity Lakes", "Helensvale"],
    "canberra": ["Civic", "Braddon", "Kingston", "Manuka", "Dickson", "Belconnen", "Woden", "Gungahlin", "Barton", "Griffith", "Turner", "Acton", "Fyshwick", "Deakin", "Tuggeranong"],

    // ----- NEW ZEALAND -----
    "auckland": ["CBD", "Ponsonby", "Newmarket", "Parnell", "Mount Eden", "Takapuna", "Devonport", "Grey Lynn", "Henderson", "Manukau", "Albany", "Botany", "Remuera", "Epsom", "Mission Bay"],
    "wellington": ["Te Aro", "Thorndon", "Mount Victoria", "Kelburn", "Newtown", "Karori", "Miramar", "Lower Hutt", "Petone", "Island Bay", "Brooklyn", "Johnsonville", "Oriental Bay", "Kilbirnie", "Hataitai"],
    "christchurch": ["City Centre", "Riccarton", "Merivale", "Addington", "Sydenham", "Fendalton", "Sumner", "Papanui", "Ilam", "Cashmere", "New Brighton", "Lyttelton", "Ferrymead", "St Albans", "Woolston"],
  };;;

  // Alternate name mappings (handles common spelling variations AND sub-area → parent city)
  const CITY_ALIASES = {
    // === Alternate city names ===
    "bombay": "mumbai",
    "new delhi": "delhi",
    "ncr": "delhi",
    "delhi ncr": "delhi",
    "bengaluru": "bangalore",
    "calcutta": "kolkata",
    "madras": "chennai",
    "poona": "pune",
    "baroda": "vadodara",
    "trivandrum": "thiruvananthapuram",
    "vizag": "visakhapatnam",
    "mysore": "mysuru",
    "mangalore": "mangaluru",
    "allahabad": "prayagraj",
    "pondicherry": "pondicherry",
    "cochin": "kochi",
    "nyc": "new york",
    "la": "los angeles",
    "sao paulo": "sao paulo",
    "são paulo": "sao paulo",
    "cdmx": "mexico city",
    "kl": "kuala lumpur",

    // === New-city alternate spellings ===
    "tiruchirappalli": "trichy",
    "tiruchchirappalli": "trichy",
    "calicut": "kozhikode",
    "washington": "washington dc",
    "saigon": "ho chi minh city",
    "hcmc": "ho chi minh city",
    "frisco": "san francisco",
    "sf": "san francisco",
    "jburg": "johannesburg",

    // === Mumbai sub-areas → mumbai ===
    "navi mumbai": "mumbai", "thane": "mumbai", "andheri": "mumbai",
    "bandra": "mumbai", "borivali": "mumbai", "dadar": "mumbai",
    "goregaon": "mumbai", "malad": "mumbai", "kandivali": "mumbai",
    "powai": "mumbai", "worli": "mumbai", "chembur": "mumbai",
    "mulund": "mumbai", "kurla": "mumbai", "vashi": "mumbai",
    "panvel": "mumbai", "kalyan": "mumbai", "dombivli": "mumbai",
    "mira road": "mumbai", "bhayandar": "mumbai", "chandivali": "mumbai",
    "chandiwali": "mumbai", "jogeshwari": "mumbai", "vikhroli": "mumbai",
    "ghatkopar": "mumbai", "sion": "mumbai", "wadala": "mumbai",
    "matunga": "mumbai", "parel": "mumbai", "lower parel": "mumbai",
    "santacruz": "mumbai", "vile parle": "mumbai", "juhu": "mumbai",
    "versova": "mumbai", "lokhandwala": "mumbai", "oshiwara": "mumbai",
    "dahisar": "mumbai", "vasai": "mumbai", "virar": "mumbai",
    "airoli": "mumbai", "nerul": "mumbai", "kharghar": "mumbai",
    "belapur": "mumbai", "seawoods": "mumbai", "sanpada": "mumbai",
    "turbhe": "mumbai", "kopar khairane": "mumbai", "ghansoli": "mumbai",
    "south mumbai": "mumbai", "fort": "mumbai", "colaba": "mumbai",
    "nariman point": "mumbai", "churchgate": "mumbai", "marine lines": "mumbai",

    // === Delhi sub-areas → delhi ===
    "gurgaon": "delhi", "gurugram": "delhi", "noida": "delhi",
    "ghaziabad": "delhi", "faridabad": "delhi", "greater noida": "delhi",
    "indirapuram": "delhi", "dwarka": "delhi", "rohini": "delhi",
    "karol bagh": "delhi", "saket": "delhi", "vasant kunj": "delhi",
    "janakpuri": "delhi", "laxmi nagar": "delhi", "pitampura": "delhi",
    "rajouri garden": "delhi", "nehru place": "delhi", "connaught place": "delhi",
    "hauz khas": "delhi", "lajpat nagar": "delhi", "south delhi": "delhi",
    "east delhi": "delhi", "west delhi": "delhi", "north delhi": "delhi",
    "cp": "delhi", "cr park": "delhi", "defence colony": "delhi",
    "greater kailash": "delhi", "green park": "delhi", "malviya nagar": "delhi",

    // === Bangalore sub-areas → bangalore ===
    "whitefield": "bangalore", "electronic city": "bangalore",
    "koramangala": "bangalore", "indiranagar": "bangalore",
    "hsr layout": "bangalore", "btm layout": "bangalore",
    "marathahalli": "bangalore", "jayanagar": "bangalore",
    "jp nagar": "bangalore", "hebbal": "bangalore",
    "yelahanka": "bangalore", "rajajinagar": "bangalore",
    "malleshwaram": "bangalore", "sarjapur": "bangalore",
    "bellandur": "bangalore", "basavanagudi": "bangalore",

    // === Hyderabad sub-areas → hyderabad ===
    "gachibowli": "hyderabad", "hitec city": "hyderabad",
    "hitech city": "hyderabad", "madhapur": "hyderabad",
    "kukatpally": "hyderabad", "secunderabad": "hyderabad",
    "kondapur": "hyderabad", "banjara hills": "hyderabad",
    "jubilee hills": "hyderabad", "ameerpet": "hyderabad",
    "begumpet": "hyderabad", "miyapur": "hyderabad",

    // === Chennai sub-areas → chennai ===
    "anna nagar": "chennai", "t nagar": "chennai",
    "velachery": "chennai", "adyar": "chennai",
    "tambaram": "chennai", "guindy": "chennai",
    "nungambakkam": "chennai", "omr": "chennai",
    "ecr": "chennai", "sholinganallur": "chennai",

    // === Pune sub-areas → pune ===
    "hinjewadi": "pune", "kothrud": "pune", "wakad": "pune",
    "baner": "pune", "viman nagar": "pune", "hadapsar": "pune",
    "kharadi": "pune", "aundh": "pune", "shivajinagar": "pune",
    "pimpri": "pune", "chinchwad": "pune", "pimpri chinchwad": "pune",
    "magarpatta": "pune", "koregaon park": "pune",

    // === Kolkata sub-areas → kolkata ===
    "salt lake": "kolkata", "rajarhat": "kolkata", "howrah": "kolkata",
    "new town": "kolkata", "jadavpur": "kolkata", "behala": "kolkata",
    "park street": "kolkata", "ballygunge": "kolkata"
  };

  /**
   * Detects the city from a search query and returns the list of surrounding areas.
   * @param {string} query - The full search query (e.g., "digital marketing mumbai")
   * @returns {{ city: string, keyword: string, areas: string[] } | null}
   */
  function detectCityAndAreas(query) {
    const lowerQuery = query.toLowerCase().trim();

    // Try each city name (longest first to avoid partial matches)
    const allCityNames = [
      ...Object.keys(CITY_AREAS),
      ...Object.keys(CITY_ALIASES)
    ].sort((a, b) => b.length - a.length);

    for (const cityName of allCityNames) {
      if (lowerQuery.includes(cityName)) {
        // Resolve alias to canonical city
        const canonicalCity = CITY_ALIASES[cityName] || cityName;
        const areas = CITY_AREAS[canonicalCity] || [];

        // Extract keyword by removing the city name
        const keyword = lowerQuery.replace(new RegExp(cityName, 'gi'), '').trim();

        return {
          city: canonicalCity,
          keyword: keyword,
          areas: areas,
          matchedName: cityName
        };
      }
    }

    return null;
  }

  // Expose globally so content.js can always find it
  window.detectCityAndAreas = detectCityAndAreas;

} // end double-injection guard (if window.__cityAreasLoaded === undefined)
