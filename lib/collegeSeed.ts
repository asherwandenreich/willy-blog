import type { College } from "./college";

// What the college tracker starts with on its first visit (when the College collection is empty).
// After that everything is edited on the page and lives in MongoDB; changing this file does nothing.
// Recommendation rule from the counselor: apps due Jan 1–8 → request letters by Dec 1; apps due Jan 15 → by Dec 11.

type Seed = Omit<College, "id" | "status" | "tasks"> & { tasks: { text: string; due?: string; details?: string }[] };

const UC_PIQS = `Answer 4 of the 8, 350 words max each.
1. Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.
2. Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.
3. What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?
4. Describe how you have taken advantage of a significant educational opportunity or worked to overcome an educational barrier you have faced.
5. Describe the most significant challenge you have faced and the steps you have taken to overcome this challenge. How has this challenge affected your academic achievement? (your note: grammar?)
6. Think about an academic subject that inspires you. Describe how you have furthered this interest inside and/or outside of the classroom.
7. What have you done to make your school or your community a better place?
8. Beyond what has already been shared in your application, what do you believe makes you a strong candidate for admissions to the University of California?`;

const CALTECH_SHORT = `Answer 2 of these 4, up to 250 words each.
1. What is an interest or hobby you do for fun, and why does it bring you joy?
2. If you could teach a class on any topic or concept, what would it be and why?
3. What is a core piece of your identity or being that shapes how you view and/or interact with the world?
4. What is a concept that blew your mind or baffled you when you first encountered it?`;

export const COLLEGE_SEED: Seed[] = [
    {
        name: "Every application",
        portal: "Common App",
        notes: "Shared pieces and deadlines that aren't tied to one school.",
        tasks: [
            {
                text: "Add Caltech & Stanford on Common App and invite recommenders there",
                due: "2026-12-01",
                details: "Teachers and the counselor submit through Common App, so they need the invite before they can upload.",
            },
            {
                text: "Request counselor + teacher recs for Caltech & Stanford",
                due: "2026-12-01",
                details: "Counselor/teacher deadline for applications due Jan 1–8 is Dec 1.\nCaltech: counselor + one math/science teacher + one humanities/social science teacher.\nStanford: counselor + two teachers of core academic subjects.\nGive each recommender your resume and the deadline.",
            },
            {
                text: "Request recs for any schools due Jan 15",
                due: "2026-12-11",
                details: "Counselor/teacher deadline for applications due Jan 15 is Dec 11. Skip this if you don't add any Jan 15 schools.",
            },
            { text: "Common App personal essay", due: "2027-01-03", details: "650 words max. Needed for Caltech and Stanford (not the UCs)." },
            { text: "Common App activities (10) and honors (5)", due: "2027-01-03" },
            {
                text: "CSS Profile for Caltech & Stanford",
                due: "2027-02-15",
                details: "Feb 15 has been Stanford's Regular Decision aid deadline; check Caltech's date on its financial aid site and move this earlier if it's sooner.",
            },
            {
                text: "FAFSA",
                due: "2027-03-02",
                details: "March 2 is the usual California Cal Grant deadline (check csac.ca.gov). Caltech and Stanford may want it by their own aid deadlines.",
            },
        ],
    },
    {
        name: "UC application",
        plan: "UC application",
        deadline: "2026-11-30",
        portal: "UC application",
        link: "https://apply.universityofcalifornia.edu/",
        notes: "Campuses: UC Irvine, UCLA, UC San Diego. One application for all three. No recommendation letters, and test scores aren't used.",
        tasks: [
            { text: "PIQ: leadership (#1)", details: "Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.\n350 words max. Draft is in Google Docs: add its link with Edit." },
            { text: "PIQ: creative side (#2)", details: "Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.\n350 words max. Draft is in Google Docs: add its link with Edit." },
            { text: "Pick your other 2 PIQs", details: UC_PIQS },
            { text: "Third PIQ", details: "350 words max." },
            { text: "Fourth PIQ", details: "350 words max." },
            { text: "Self-report courses and grades (A–G)", details: "Have your transcript open; enter every A–G course and grade exactly as it appears." },
            { text: "Activities & awards (up to 20)" },
            { text: "Additional comments (optional)" },
            { text: "Select UCI, UCLA, UCSD and pay fees or get a fee waiver" },
            { text: "Submit the UC application", due: "2026-11-30", details: "Submit a few days early; the site gets slow near the deadline." },
        ],
    },
    {
        name: "Caltech",
        plan: "Regular Decision",
        deadline: "2027-01-03",
        portal: "Common App",
        link: "https://www.admissions.caltech.edu/",
        notes: "Confirm the exact Regular Decision date on Caltech's admissions site. Recs requested by Dec 1.",
        tasks: [
            { text: "Your STEM future: choose 1–2 areas of interest", details: "If you had to choose an area of interest or two today, what would you choose?" },
            { text: "Your STEM future: why that area (100–200 words)", details: "Why did you choose your proposed area of interest? If you selected 'other', what topics are you interested in pursuing?" },
            { text: "Your STEM past (100–200 words)", details: "Pick one:\n1. Tell us how you initially found your interest and passion for science or for a particular STEM topic, and how you have pursued or developed your interest or passion over the last few years.\n2. Tell us about a meaningful STEM-related experience from the last few years and share how and why it inspired your curiosity." },
            { text: "Creativity in action (100–200 words)", details: "How have you been a creator, inventor, or innovator in your own life?\n(Context: Techers innovate in small ways every day, from new solar cell designs to 3D-printed dorm decor to new recipes.)" },
            { text: "Short answer 1 of 2 (250 words)", details: CALTECH_SHORT },
            { text: "Short answer 2 of 2 (250 words)", details: CALTECH_SHORT },
            { text: "Extenuating circumstances (optional)", details: "Limited course selection, disruptions, or anything else that affected coursework and isn't described elsewhere." },
            { text: "Check Caltech's testing policy; send scores if needed" },
            { text: "Pay the fee or request a waiver" },
            { text: "Submit Caltech application", due: "2027-01-03" },
        ],
    },
    {
        name: "Stanford",
        plan: "Regular Decision",
        deadline: "2027-01-05",
        portal: "Common App",
        link: "https://admission.stanford.edu/",
        notes: "Confirm the exact Regular Decision date on Stanford's admission site. Recs requested by Dec 1.",
        tasks: [
            { text: "Essay: excited about learning (100–250 words)", details: "The Stanford community is deeply curious and driven to learn in and out of the classroom. Reflect on an idea or experience that makes you genuinely excited about learning." },
            { text: "Essay: note to your future roommate (100–250 words)", details: "Virtually all of Stanford's undergraduates live on campus. Write a note to your future roommate that reveals something about you or that will help your roommate—and us—get to know you better." },
            { text: "Essay: distinctive contribution (100–250 words)", details: "Please describe what aspects of your life experiences, interests and character would help you make a distinctive contribution as an undergraduate to Stanford University." },
            { text: "Short questions (50 words each)", details: "Stanford's Common App section also has a set of 50-word short questions that weren't in your list. Open the Stanford questions in Common App to see this year's set." },
            { text: "Send SAT/ACT scores", details: "Stanford requires test scores again. Check how they want them reported (self-report vs official)." },
            { text: "Pay the fee or request a waiver" },
            { text: "Submit Stanford application", due: "2027-01-05" },
        ],
    },
];
