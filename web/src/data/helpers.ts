// Who can help with each step. "free" entries are real public programs; "vendor" entries are SAMPLE listings
// (fictional names, 555 phone numbers) that show how a local vendor directory would look.
export type Helper = {
  name: string; kind: "free" | "vendor"; role: string; note: string;
  rating?: number; reviews?: number; price?: string; distance?: string; phone?: string; url?: string;
};

const FREE: Record<string, Helper> = {
  permitCenter: { name: "San José Permit Center", kind: "free", role: "City permit counter", note: "Planners and building staff answer questions in person at City Hall, 200 E. Santa Clara St.", phone: "408-535-3555", url: "https://www.sanjoseca.gov/business/development-services-permit-center" },
  allies: { name: "City Small Business Allies", kind: "free", role: "Permit navigation", note: "City staff who help small businesses through permits and run the Streamlined Restaurant Program.", url: "https://www.sjeconomy.com/how-we-help/programs-and-services" },
  deh: { name: "County Environmental Health Plan Check", kind: "free", role: "Health plan questions", note: "Drop-in help weekdays 7:30–10 AM at 1555 Berger Dr., or by appointment.", phone: "408-918-3400", url: "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and" },
  sbdc: { name: "Small Business Development Center", kind: "free", role: "Business advisor", note: "Free one-on-one advising on entity setup, financing and leases.", url: "https://www.sba.gov/local-assistance" },
  abc: { name: "ABC San Jose District Office", kind: "free", role: "Alcohol licensing", note: "Licensing staff explain license types and the application.", url: "https://www.abc.ca.gov/licensing/" },
  cdtfa: { name: "CDTFA taxpayer help", kind: "free", role: "Sales tax questions", note: "Help registering and filing sales tax.", url: "https://cdtfa.ca.gov/" },
  svPermitCenter: { name: "Sunnyvale One-Stop Permit Center", kind: "free", role: "City permit counter", note: "Building, Fire, Planning and Engineering at City Hall, 456 W. Olive Ave., 2nd floor. Over-the-counter plan check appointments in the morning.", phone: "408-730-7444", url: "https://www.sunnyvale.ca.gov/business-and-development/planning-and-building/permit-center" },
  svEconDev: { name: "Sunnyvale Economic Development", kind: "free", role: "Site and zoning help", note: "Helps you check zoning and find a space before you sign a lease.", phone: "408-730-7607", url: "https://www.sunnyvale.ca.gov/business-and-development/economic-development/start-and-grow-your-business/verify-property-zoning" },
  svLicense: { name: "Sunnyvale Business Licensing", kind: "free", role: "Business license", note: "Questions about the business license application and tax table.", phone: "408-730-7620", url: "https://www.sunnyvale.ca.gov/business-and-development/your-business-center/business-licenses" },
  edd: { name: "EDD Taxpayer Assistance", kind: "free", role: "Payroll tax questions", note: "Help registering as an employer and filing payroll reports.", url: "https://edd.ca.gov/" },
};

const V = (name: string, role: string, note: string, rating: number, reviews: number, price: string, distance: string, n: number): Helper =>
  ({ name, kind: "vendor", role, note, rating, reviews, price, distance, phone: `(408) 555-01${String(n).padStart(2, "0")}` });

const VENDORS: Record<string, Helper[]> = {
  lawyer: [V("Almaden Business Law", "Business attorney", "Entity setup, lease review", 4.8, 112, "$250–400/hr", "1.2 mi", 10), V("Guadalupe Legal Group", "Business attorney", "Flat-fee LLC formation", 4.6, 58, "$900 flat", "2.8 mi", 11)],
  cpa: [V("Market Street CPAs", "Accountant", "Tax registration, payroll setup, bookkeeping", 4.7, 89, "$150–250/hr", "0.6 mi", 12), V("North Star Bookkeeping", "Bookkeeper", "Monthly books and sales tax filing", 4.5, 41, "$300–600/mo", "3.1 mi", 13)],
  expediter: [V("Silicon Valley Permit Pros", "Permit expediter", "Handles City and County submittals for you", 4.9, 76, "$2–6K per project", "1.5 mi", 14), V("Paseo Permit Services", "Permit expediter", "Restaurant and café specialists", 4.6, 33, "$1.5–4K", "2.2 mi", 15)],
  designer: [V("Studio Cordova Architecture", "Architect", "Restaurant tenant improvements, stamped plans", 4.8, 64, "$8–20K", "0.9 mi", 16), V("Kitchen Layout Co.", "Food service designer", "Health-code kitchen layouts and equipment specs", 4.7, 45, "$3–8K", "4.0 mi", 17)],
  contractor: [V("Redwood Builders", "General contractor", "Commercial TI, restaurants", 4.6, 128, "Bid-based", "2.4 mi", 18), V("Keystone Commercial", "General contractor", "Retail and café buildouts", 4.4, 71, "Bid-based", "5.2 mi", 19)],
  hood: [V("Caldera Hood & Fire", "Hood and fire suppression", "Type I/II hoods, suppression permits", 4.8, 52, "$8–25K installed", "3.6 mi", 20)],
  sign: [V("Lantern Sign Works", "Sign company", "Design, fabrication and sign permit drawings", 4.7, 61, "$2.5–7K", "1.8 mi", 21)],
  abcConsultant: [V("Bay License Consulting", "Alcohol license consultant", "ABC applications and license brokering", 4.8, 39, "$1.5–4K", "6.0 mi", 22)],
  foodSafety: [V("SafeServe Training SJ", "Food safety class", "Manager certification course and proctored exam", 4.6, 210, "$150–200", "1.1 mi", 23)],
  insurance: [V("Cypress Insurance Agency", "Insurance broker", "General liability, workers' comp, certificates for the City", 4.7, 95, "Quote-based", "0.8 mi", 24)],
  broker: [V("Plaza Business Brokers", "Business broker", "Buying an existing café or restaurant", 4.5, 22, "Commission", "2.0 mi", 25)],
};

const MAP: Record<string, (keyof typeof FREE | keyof typeof VENDORS)[]> = {
  sj_zoning_check: ["permitCenter", "allies", "expediter"], scc_zoning_clearance: ["expediter"],
  sj_alcohol_use_permit: ["permitCenter", "expediter", "abcConsultant"], scc_use_permit_alcohol: ["expediter", "abcConsultant"],
  sos_llc: ["sbdc", "lawyer"], sos_corp: ["sbdc", "lawyer"], sos_statement_of_information: ["lawyer"],
  irs_ein: ["sbdc", "cpa"], sj_business_tax_certificate: ["allies", "cpa"], cdtfa_sellers_permit: ["cdtfa", "cpa"],
  scc_fbn: ["lawyer"], edd_employer: ["edd", "cpa"],
  deh_plan_check: ["deh", "designer", "expediter"], deh_change_of_ownership: ["deh", "broker", "lawyer"],
  sj_building_permit_srp: ["allies", "permitCenter", "designer", "expediter"], sj_building_permit: ["permitCenter", "designer", "expediter"],
  scc_building_permit: ["designer", "expediter"], scc_fire_marshal_review: ["hood"],
  sj_sign_permit: ["permitCenter", "sign"], scc_sign_permit: ["sign"],
  work_full_buildout: ["contractor", "hood"], work_kitchen_buildout: ["contractor", "hood"], work_fitout: ["contractor"], work_takeover: ["broker", "contractor"],
  sj_final_inspection: ["permitCenter", "contractor"], scc_final_inspection: ["contractor"],
  deh_permit_to_operate: ["deh"], abc_type41: ["abc", "abcConsultant"], abc_type47: ["abc", "abcConsultant", "broker"],
  abc_type20: ["abc", "abcConsultant"], abc_type21: ["abc", "abcConsultant"], abc_issuance: ["abc"],
  sj_sidewalk_cafe: ["allies", "insurance"], scc_encroachment_permit: ["insurance"],
  sv_zoning_check: ["svEconDev", "expediter"], sv_alcohol_use_permit: ["svEconDev", "abcConsultant"], sv_business_license: ["svLicense", "cpa"],
  sv_building_permit: ["svPermitCenter", "designer", "expediter"], sv_sign_permit: ["svPermitCenter", "sign"], sv_final_inspection: ["svPermitCenter", "contractor"],
  sv_sidewalk_seating: ["svPermitCenter", "insurance"],
  food_manager_cert: ["foodSafety"], local_placeholder: ["sbdc", "expediter"],
};

export function helpersFor(ruleId: string): { free: Helper[]; vendors: Helper[] } {
  const keys = MAP[ruleId] ?? ["sbdc"];
  return {
    free: keys.filter(k => k in FREE).map(k => FREE[k as keyof typeof FREE]),
    vendors: keys.filter(k => k in VENDORS).flatMap(k => VENDORS[k as keyof typeof VENDORS]),
  };
}
