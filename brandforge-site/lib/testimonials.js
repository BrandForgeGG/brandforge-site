'use strict';

// 2026-10-10: five newer reviews were added at the top (pasted by the founder). Discord's own codes were taken out
// so they read as people wrote them: user mentions and a custom emoji, and one closing line that was only a
// thank-you to two mentioned users. The words that remain are exactly as written.
//
// Verbatim client feedback copied from BrandForge's Discord and Telegram by
// the founder (2026-10-03). Nothing here may be paraphrased, corrected or
// invented — typos, emoji and all. Three entries with empty bodies and one
// non-endorsement were excluded by the founder's instruction; they are not in
// this file.

const TESTIMONIALS = [
  {
    id: "frontend-clean-functional",
    author: 'BrandForge client',
    date: '',
    text: "I can vouch for their work. His team built a clean and functional frontend site for my upcoming project. They are very generous and understanding people. I’ll definitely be coming back for future projects. Overall, amazing service!",
  },
  {
    id: "motion-graphics-designer",
    author: 'BrandForge client',
    date: '',
    text: "Working with the Brandforge team has been extremely sensational. I feel as though I’m brought to tears by how amazing this team has been, I was given more than enough with what I already had. I am truly amazed at the motion graphics given to me by their designer and the detail put into this work. Thank you so much:)",
  },
  {
    id: "full-team-stepped-in",
    author: 'BrandForge client',
    date: '',
    text: "Working with BrandForge has been a positive experience overall. The project began with an initial developer who, after a series of delays, ultimately stepped away. In response, BrandForge brought in a full team to keep things moving — showing a clear commitment to delivering results. While we're not yet at the finish line, they've consistently gone above and beyond to ensure we're satisfied and supported throughout the process. Their responsiveness, professionalism, and willingness to adapt have made a meaningful difference. I'm confident in their dedication to seeing this project through successfully.",
  },
  {
    id: "support-understands-project",
    author: 'BrandForge client',
    date: '',
    text: "Awesome support team, they try to understand your project to make something special for you",
  },
  {
    id: "two-projects-9-10",
    author: 'BrandForge client',
    date: '',
    text: "Very professional team, worked on 2 projects with me and had no issues besides slight delays, but were compensated accordingly. Backend work was very professional and overall 9/10 experience.",
  },
  // ---- Earlier entries ----
  {
    id: 'brandforge-group-zyllls',
    author: 'BrandForge Group',
    date: '19/02/2025 13:51',
    text: 'vouch @zyllls for amazing logos and graphics! $500+ in deals. went smooth & easy. 🤝🏻',
  },
  {
    id: 'brandforge-group-9-emails',
    author: 'BrandForge Group',
    date: '28/08/2025 21:50',
    text: 'Vouch @IordMX and his team. Made 9 old emails match our new branding in 24 hours!',
  },
  {
    id: 'headstartup-milestone-350',
    author: 'BrandForge',
    date: '08/09/2025 0:49',
    text: 'Vouch @headstartup, first milestone approved, $350 released from $1.5k total for full stack site and discord,telegram bots. Project paused for weeks due to another opportunity coming in.',
  },
  {
    id: 'headstartup-frontend',
    author: 'BrandForge',
    date: '19/09/2025 8:05',
    text: 'Vouch @headstartup and BrandForge team. Super fast and smooth frontend development.',
  },
  {
    id: 'eddie-website',
    author: '! Eddie',
    date: '16/11/2024 2:22',
    text: '+ Vouch, bought a website, very good team of developers, very fast, good price,',
  },
  {
    id: 'nioos-traffic',
    author: 'Nioos',
    date: '24/11/2024 14:10',
    text: '+Vouch and big thanks to BrandFroge for their outstanding support and delivery, and i highly recommend their targeted traffic services with high-quality organic posts and threads',
  },
  {
    id: 'deleted-user-content',
    author: 'Deleted User',
    date: '25/11/2024 3:22',
    text: 'High quality services Have purchased a ton of social media content and everything has been great.',
  },
  {
    id: 'deleted-user-mx-growth',
    author: 'Deleted User',
    date: '05/12/2024 22:33',
    text: 'vouch @MX helped me expand my brand - grew the discord & sales. great service for a cheap price',
  },
  {
    id: 'ceaser-fakeraymond',
    author: '! CeaserRodregaz',
    date: '18/12/2024 17:19',
    text: 'Vouch @fakeraymond Great response time, great work, very professional',
  },
  {
    id: 'deleted-user-drayvo',
    author: 'Deleted User',
    date: '22/01/2025 22:31',
    text: 'vouch for @DRAYVO did good work in a short amount of time and i got no regrets ! will def come here again',
  },
  {
    id: 'day-zizo-3k',
    author: 'day',
    date: '24/01/2025 7:04',
    text: 'Vouch @Zizo $3k+ in dev work very professional, very kind and gets work done on time while maintaining quality',
  },
  {
    id: 'deleted-user-bashbaba-fast',
    author: 'Deleted User',
    date: '24/01/2025 9:21',
    text: 'vouch @bashbaba did the work incredibly fast and came out great, incredible designer',
  },
  {
    id: 'mike-gfx',
    author: 'Mike',
    date: '24/01/2025 22:26',
    text: 'Vouch for @bashbaba delivered some quick gfx work. High quality and easy to deal with',
  },
  {
    id: 'apple-zizo-10min',
    author: 'Apple',
    date: '01/02/2025 18:05',
    text: "vouch @Zizo made me a discord bot that involved annoying API'S within 10 minutes somehow, I think this guy is a wizzard or something but it's okay.",
  },
  {
    id: 'apple-prince',
    author: 'Apple',
    date: '02/02/2025 19:54',
    text: 'vouch @Prince re-did my thread design flawlessly, also made me a logo',
  },
  {
    id: 's-bashbaba-king',
    author: 's',
    date: '02/02/2025 20:48',
    text: 'vouch @bashbaba absolute king I love u so much man',
  },
  {
    id: 'k20-valaccs',
    author: 'K20',
    date: '07/02/2025 9:33',
    text: '@Zizo,\nVouch+\nMade us a starting point within days and within the budget\nView our collaborative work here : ValAccs (https://valaccs.com/)\n@MX,\nVouch+\nGreat middleman/manager for this team.',
  },
  {
    id: 'apple-zizo-again',
    author: 'Apple',
    date: '09/02/2025 20:03',
    text: 'vouch @Zizo made a discord bot for me within 10 minutes again, dudes a wizzard for real but its okay lol',
  },
  {
    id: 'vizzy-900-bot',
    author: 'vizzy',
    date: '11/02/2025 17:02',
    text: 'vouch for @Zizo , ended up making a $900 bot within a day which we agreed for 3 days, absolutely great work',
  },
  {
    id: 'clippy-poc',
    author: 'ClippyCult {degen}',
    date: '07/03/2025 4:04',
    text: "@Zizo came through for a degen during degen hours and had everything prim and proper by the time I woke up. Identified and solved problems I didn't even know about. He's the POC for dev work now",
  },
  {
    id: 'btx-gif',
    author: 'btxmixer',
    date: '13/03/2025 22:02',
    text: 'big vouch did a great job on my gif would highly recommend',
  },
  {
    id: 'taylann-boke',
    author: 'TaYLaNN 1VPS.cc',
    date: '18/03/2025 2:01',
    text: "@! boke ★ Best GFX/GIF Animated. This guys is awesome. He do my work in 3 days. I will order more from him if he work like this everytime 1000/10",
  },
  {
    id: 'hks-logo',
    author: 'hks',
    date: '28/03/2025 2:36',
    text: '@DRAYVO made us a nice logo.',
  },
  {
    id: 'rensh-banner',
    author: 'ren_sh',
    date: '02/04/2025 15:24',
    text: "@! boke ★ Very good banner created. He was very considerate and even noticed some errors in the instructions we didn't think of. Would definitely work with him again!",
  },
  {
    id: 'charizard-5stars',
    author: 'Charizard',
    date: '10/04/2025 0:05',
    text: '@DRAYVO is a boss! Continues to look after my businesses social media designs. Very professional and great attention to detail. Recommend! 5 ⭐️',
  },
  {
    id: 'airport-support',
    author: 'myairporttt',
    date: '08/06/2025 3:06',
    text: 'Awesome support team, they try to understand your project to make something special for you',
  },
  {
    id: 'airport-awsome',
    author: 'myairporttt',
    date: '28/06/2025 3:26',
    text: 'Awsome team and excellent result, @! boke ★',
  },
  {
    id: 'vizzy-multiple-projects',
    author: 'vizzy',
    date: '08/07/2025 23:17',
    text: 'very great team, got done multiple projects for me so far and im looking for more in the future, thanks for the latest one to @TomDev',
  },
  {
    id: 'vizzy-fast-deal',
    author: 'vizzy',
    date: '12/07/2025 23:48',
    text: 'thanks @TomDev @MX for the fast deal again, can only vouch for this server, fast and reliable',
  },
  {
    id: 'psycho-team',
    author: 'Psycho',
    date: '13/07/2025 3:02',
    text: "Working with BrandForge has been a positive experience overall. The project began with an initial developer who, after a series of delays, ultimately stepped away. In response, BrandForge brought in a full team to keep things moving — showing a clear commitment to delivering results. While we're not yet at the finish line, they've consistently gone above and beyond to ensure we're satisfied and supported throughout the process. Their responsiveness, professionalism, and willingness to adapt have made a meaningful difference. I'm confident in their dedication to seeing this project through successfully. Huge thanks to @MX and @Amine for their continued efforts and support.",
  },
  {
    id: 'vizzy-2k',
    author: 'vizzy',
    date: '17/07/2025 16:07',
    text: 'one more $2k project done, thanks again for @TomDev for an amazing and fast work, and thanks @MX also for the mm service',
  },
  {
    id: 'omballa-motion',
    author: 'Omballa',
    date: '30/07/2025 15:35',
    text: 'Working with the Brandforge team has been extremely sensational. I feel as though I’m brought to tears by how amazing this team has been, I was given more than enough with what I already had. I am truly amazed at the motion graphics given to me by their designer and the detail put into this work. Thank you so much:)',
  },
  {
    id: 'can-drayvo-designs',
    author: 'Can',
    date: '18/08/2025 5:28',
    text: 'Thanks to @DRAYVO for the designs, its such a good guy with so much heart and passion doing all that stuff i just can recommend him, his designs are not from this world',
  },
  {
    id: 'zzz-frontend',
    author: 'zzz',
    date: '13/09/2025 1:43',
    text: 'I can vouch for their work. His team built a clean and functional frontend site for my upcoming project. They are very generous and understanding people. I’ll definitely be coming back for future projects. Overall, amazing service!',
  },
  {
    id: 'btsynical-refund',
    author: 'BTSynical',
    date: '22/09/2025 12:26',
    text: 'Unfortunately I decided to cancel our project, and got a refund. Either way, the Brandforge team was professional throughout the process and I will say props to the team for their sportsmanship.',
  },
  {
    id: 'crum-9-10',
    author: 'crum',
    date: '15/01/2026 20:59',
    text: 'Very professional team, worked on 2 projects with me and had no issues besides slight delays, but were compensated accordingly. Backend work was very professional and overall 9/10 experience.',
  },
];

// Curated subset shown on the landing page — order matters. The rest stays
// available for the founder to place later (all 36 remain in TESTIMONIALS).
const LANDING_TESTIMONIAL_IDS = [
  "frontend-clean-functional",
  "motion-graphics-designer",
  "full-team-stepped-in",
  "support-understands-project",
  "two-projects-9-10",
];

module.exports = { TESTIMONIALS, LANDING_TESTIMONIAL_IDS };
