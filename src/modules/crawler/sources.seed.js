'use strict';

/**
 * Canonical, hand-verified Source Registry.
 *
 * Every entry is an official government / commission / board recruitment
 * portal — nothing here is auto-discovered. This list is the single source
 * of truth: it is applied automatically (idempotently) on every server
 * boot by src/database/connection.js, and also drives the admin "Add
 * common source" picker. Add new sources here rather than only in the
 * database, so a fresh clone of the project starts with full coverage.
 */
module.exports = [
  // --- All India / Central Commissions & Portals ---
  ['UPSC Active Exams', 'https://upsc.gov.in/examinations/active-exams', 'All-India'],
  ['SSC Notice Board', 'https://ssc.gov.in/notices', 'All-India'],
  ['NTA (National Testing Agency)', 'https://nta.ac.in/', 'All-India'],
  ['National Career Service (NCS)', 'https://www.ncs.gov.in/', 'All-India'],
  ['IBPS (Banking)', 'https://www.ibps.in/', 'All-India'],
  ['RRB Central (Railway)', 'https://www.rrbapply.gov.in/', 'All-India'],
  ['RRB Chandigarh Central', 'https://rrbcdg.gov.in/', 'All-India'],

  // --- Teaching & Eligibility Test Portals ---
  ['CTET (CBSE)', 'https://ctet.nic.in/', 'All-India'],
  ['UTET / UBTER Uttarakhand', 'https://www.ubter.in/', 'Uttarakhand'],
  ['UGC NET (NTA)', 'https://ugcnet.nta.ac.in/', 'All-India'],
  ['KVS (Kendriya Vidyalaya Sangathan)', 'https://kvsangathan.nic.in/', 'All-India'],
  ['NVS (Navodaya Vidyalaya Samiti)', 'https://navodaya.gov.in/', 'All-India'],

  // --- North & Central India ---
  ['Uttarakhand PSC', 'https://psc.uk.gov.in/', 'Uttarakhand'],
  ['UKSSSC Uttarakhand', 'https://sssc.uk.gov.in/', 'Uttarakhand'],
  ['UPPSC', 'https://uppsc.up.nic.in/', 'Uttar Pradesh'],
  ['UPSSSC Notices', 'https://upsssc.gov.in/Default.aspx', 'Uttar Pradesh'],
  ['DSSSB Delhi', 'https://dsssb.delhi.gov.in/', 'Delhi'],
  ['RPSC Rajasthan', 'https://rpsc.rajasthan.gov.in/', 'Rajasthan'],
  ['RSMSSB Rajasthan', 'https://rsmssb.rajasthan.gov.in/', 'Rajasthan'],
  ['MPPSC', 'https://mppsc.mp.gov.in/', 'Madhya Pradesh'],
  ['MPESB (Vyapam)', 'https://esb.mp.gov.in/', 'Madhya Pradesh'],
  ['HPSC Haryana', 'https://hpsc.gov.in/', 'Haryana'],
  ['HSSC Haryana', 'https://hssc.gov.in/', 'Haryana'],
  ['PPSC Punjab', 'https://ppsc.gov.in/', 'Punjab'],
  ['PSSSB Punjab', 'https://sssb.punjab.gov.in/', 'Punjab'],
  ['HPPSC Himachal Pradesh', 'http://www.hppsc.hp.gov.in/hppsc/', 'Himachal Pradesh'],
  ['HPRCA Himachal Pradesh', 'https://hprca.hp.gov.in/', 'Himachal Pradesh'],
  ['JKPSC', 'https://jkpsc.nic.in/', 'Jammu & Kashmir'],
  ['JKSSB', 'https://jkssb.nic.in/', 'Jammu & Kashmir'],
  ['Chandigarh Recruitment', 'https://chandigarh.gov.in/recruitment', 'Chandigarh'],

  // --- East & North-East India ---
  ['BPSC Bihar Notices', 'https://www.bpsc.bih.nic.in/', 'Bihar'],
  ['BPSC Bihar (New Portal)', 'https://bpsc.bihar.gov.in/', 'Bihar'],
  ['BSSC Bihar', 'https://bssc.bihar.gov.in/', 'Bihar'],
  ['JPSC Jharkhand', 'https://www.jpsc.gov.in/', 'Jharkhand'],
  ['JSSC Jharkhand', 'https://jssc.nic.in/', 'Jharkhand'],
  ['WBPSC West Bengal', 'https://psc.wb.gov.in/', 'West Bengal'],
  ['WBPRB West Bengal', 'https://prb.wb.gov.in/', 'West Bengal'],
  ['OPSC Odisha', 'https://opsc.gov.in/', 'Odisha'],
  ['OSSC Odisha', 'https://ossc.gov.in/', 'Odisha'],
  ['OSSSC Odisha', 'https://osssc.gov.in/', 'Odisha'],
  ['Chhattisgarh PSC', 'https://psc.cg.gov.in/', 'Chhattisgarh'],
  ['CG Vyapam', 'https://vyapam.cgstate.gov.in/', 'Chhattisgarh'],
  ['APSC Assam', 'https://apsc.nic.in/', 'Assam'],
  ['Assam Direct Recruitment', 'https://assam.gov.in/recruitment', 'Assam'],
  ['SEBA Assam', 'https://sebaonline.org/', 'Assam'],
  ['Assam Directorate of Employment & Craftsmen Training', 'https://dect.assam.gov.in/', 'Assam'],
  ['APPSC Arunachal Pradesh', 'https://appsc.gov.in/', 'Arunachal Pradesh'],
  ['APSSB Arunachal Pradesh', 'https://apssb.nic.in/', 'Arunachal Pradesh'],
  ['MPSC Manipur', 'https://mpscmanipur.gov.in/', 'Manipur'],
  ['MPSC Meghalaya', 'https://mpsc.nic.in/', 'Meghalaya'],
  ['Meghalaya Recruitment', 'https://megrecruitment.nic.in/', 'Meghalaya'],
  ['MPSC Mizoram', 'https://mpsc.mizoram.gov.in/', 'Mizoram'],
  ['MSSSB Mizoram', 'https://msssb.mizoram.gov.in/', 'Mizoram'],
  ['NPSC Nagaland', 'https://npsc.nagaland.gov.in/', 'Nagaland'],
  ['NSSB Nagaland', 'https://nssb.nagaland.gov.in/', 'Nagaland'],
  ['SPSC Sikkim', 'https://spsc.sikkim.gov.in/', 'Sikkim'],
  ['TPSC Tripura', 'https://tpsc.tripura.gov.in/', 'Tripura'],
  ['JRBT Tripura', 'https://jrbtripura.com/', 'Tripura'],
  ['Tripura State Notice Board', 'https://tripura.gov.in/notice', 'Tripura'],
  ['Tripura Directorate of Employment Services', 'https://desmp.tripura.gov.in/', 'Tripura'],

  // --- West & South India ---
  ['MPSC Maharashtra', 'https://mpsc.gov.in/', 'Maharashtra'],
  ['Maharashtra Recruitment (Mahaonline)', 'https://maharecruitment.mahaonline.gov.in/', 'Maharashtra'],
  ['GPSC Gujarat', 'https://gpsc.gujarat.gov.in/', 'Gujarat'],
  ['GSSSB Gujarat', 'https://gsssb.gujarat.gov.in/', 'Gujarat'],
  ['OJAS Gujarat', 'https://ojas.gujarat.gov.in/', 'Gujarat'],
  ['GPSC Goa', 'https://gpsc.goa.gov.in/', 'Goa'],
  ['CBES Goa (Staff Selection)', 'https://cbes.goa.gov.in/', 'Goa'],
  ['APPSC Andhra Pradesh', 'https://psc.ap.gov.in/', 'Andhra Pradesh'],
  ['SLPRB Andhra Pradesh', 'https://slprb.ap.gov.in/', 'Andhra Pradesh'],
  ['TSPSC Telangana', 'https://websitenew.tspsc.gov.in/', 'Telangana'],
  ['TGSLPRB Telangana', 'https://tgslprb.org/', 'Telangana'],
  ['KPSC Karnataka', 'https://kpsc.kar.nic.in/', 'Karnataka'],
  ['KEA Karnataka', 'https://kpea.karnataka.gov.in/', 'Karnataka'],
  ['TNPSC Tamil Nadu', 'https://www.tnpsc.gov.in/', 'Tamil Nadu'],
  ['TRB Tamil Nadu', 'https://www.trb.tn.gov.in/', 'Tamil Nadu'],
  ['MRB Tamil Nadu', 'https://www.mrb.tn.gov.in/', 'Tamil Nadu'],
  ['Kerala PSC', 'https://www.keralapsc.gov.in/', 'Kerala'],
  ['Puducherry Recruitment', 'https://recruitment.py.gov.in/', 'Puducherry'],
  ['Andaman & Nicobar e-Recruitment', 'https://erecruitment.andaman.gov.in/', 'Andaman & Nicobar'],
].map(([name, url, state]) => ({ name, url, state, category: 'Latest Jobs' }));
