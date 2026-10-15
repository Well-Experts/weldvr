// Arabic interface text for the pipe (open root) module (DRAFT for review by an Arabic-speaking welding
// specialist). Pipe sizes (NPS, DN, Sch), positions (1G, PH, H-L045), electrode classifications, clause
// numbers and units are not translated.

export const AR_PIPE = {
  // ---- joint, positions, sizes -----------------------------------------------------------------------
  'Pipe, open root': 'أنبوب، جذر مفتوح',
  'Pipe, open root (B6)': 'أنبوب، جذر مفتوح (B6)',
  'Pipe butt weld, open root': 'لحام تناكبي للأنابيب بجذر مفتوح',
  'Pipe': 'الأنبوب',
  'Plate and sheet': 'الألواح والصفائح',
  '1G pipe rotated (PA)': '1G أنبوب يُدار أثناء اللحام (PA)',
  '2G pipe axis vertical (PC)': '2G محور الأنبوب رأسي (PC)',
  '5G pipe fixed, axis horizontal, uphill (PH)': '5G أنبوب ثابت بمحور أفقي، لحام صاعد (PH)',
  '5G pipe fixed, axis horizontal, downhill (PJ)': '5G أنبوب ثابت بمحور أفقي، لحام هابط (PJ)',
  '6G pipe fixed at 45°, uphill (H-L045)': '6G أنبوب ثابت بزاوية 45°، لحام صاعد (H-L045)',
  '6G pipe fixed at 45°, downhill (J-L045)': '6G أنبوب ثابت بزاوية 45°، لحام هابط (J-L045)',
  'NPS 6 (DN 150) Sch 80': 'NPS 6 (DN 150) Sch 80',
  'NPS 6 (DN 150) Sch 40': 'NPS 6 (DN 150) Sch 40',
  'NPS 2 (DN 50) Sch 80': 'NPS 2 (DN 50) Sch 80',
  'NPS 2 (DN 50) XXS': 'NPS 2 (DN 50) XXS',
  'Uphill': 'صاعد',
  'Downhill': 'هابط',
  'root to cap': 'من الجذر حتى الغطاء',
  'root pass': 'تمريرة الجذر',
  'single-V, 60°, land': 'شطف V مفرد، 60°، وجه الجذر',
  'gap': 'الفجوة',
  'no backing': 'بدون حلقة دعم',

  // ---- WPS --------------------------------------------------------------------------------------------
  'Training WPS: electrodes and currents from the Lincoln C2.420 in-plant pipe procedure table (DC+), electrode angles by position from ESAB; travel speeds and the interpass limit are seeds. Not a qualified procedure.':
    'مواصفة إجراء لحام تدريبية: الإلكترودات والتيارات من جدول إجراءات لحام الأنابيب داخل المصنع في Lincoln C2.420 (DC+)، وزوايا الإلكترود حسب الوضع من ESAB؛ سرعات التقدم وحد درجة الحرارة بين التمريرات قيم أولية. ليست إجراءً مؤهَّلاً.',
  'Training WPS (downhill root pass): 1/8 in E6010 in the electrode data-sheet range (Hobart 610, Lincoln Fleetweld 5P+), DC+; electrode angles by position from ESAB and Lincoln C2.410; travel speed is a seed. Not a qualified procedure.':
    'مواصفة إجراء لحام تدريبية (تمريرة جذر هابطة): إلكترود E6010 قطر 1/8 بوصة ضمن نطاق نشرة بيانات الإلكترود (Hobart 610، Lincoln Fleetweld 5P+)، DC+؛ زوايا الإلكترود حسب الوضع من ESAB وLincoln C2.410؛ سرعة التقدم قيمة أولية. ليست إجراءً مؤهَّلاً.',
  'WPS for this pass': 'مواصفة الإجراء لهذه التمريرة',
  'Next pass': 'التمريرة التالية',

  // ---- live cues and controls -------------------------------------------------------------------------
  'Keyhole': 'ثقب المفتاح',
  'closed': 'مغلق',
  'open': 'مفتوح',
  'large': 'كبير',
  'burning through': 'اختراق كامل',
  'No keyhole: the root is not penetrating. Travel slower and keep the arc in the gap.': 'لا يوجد ثقب مفتاح: الجذر لا يخترق. تقدّم أبطأ وأبقِ القوس داخل الفجوة.',
  'Keyhole too big: travel faster, or whip the electrode up out of the crater for a moment.': 'ثقب المفتاح كبير جداً: تقدّم أسرع، أو اسحب طرف الإلكترود للأعلى خارج الحفرة للحظة.',
  'Point the electrode at the joint': 'وجّه الإلكترود نحو الوصلة',
  'Arc at': 'القوس عند',
  "o'clock": 'على الساعة',
  'round the joint': 'حول الوصلة',
  'electrode angle here': 'زاوية الإلكترود هنا',
  'push': 'دفع',
  'drag': 'سحب',
  'Grind starts and craters': 'جلخ البدايات والحفر',
  'Starts and craters ground to a feathered edge: {n}.': 'جُلخت البدايات والحفر إلى حافة مستدقة: {n}.',
  'Nothing to grind on this pass yet.': 'لا يوجد ما يُجلخ في هذه التمريرة بعد.',
  'Roll the pipe ¼ turn': 'أدر الأنبوب ربع دورة',
  'Root: keep a small keyhole open at the root the whole way; if it closes the root is not penetrating. The cue strip shows it.':
    'الجذر: حافظ على ثقب مفتاح صغير مفتوح عند الجذر طوال الوقت؛ إذا انغلق فالجذر لا يخترق. يظهره شريط الإرشادات.',
  'Change the electrode angle with the position: push 5–10° up the joint on the sides, drag slightly at the top and overhead (the travel-angle window follows the arc round the pipe).':
    'غيّر زاوية الإلكترود مع الوضع: ادفع 5–10° باتجاه أعلى الوصلة على الجانبين، واسحب قليلاً في الأعلى وفي الوضع العلوي (نافذة زاوية التقدم تتبع القوس حول الأنبوب).',
  'Grind the start and the crater of each run to a feathered edge before you tie in to them; start each pass away from where the last one started.':
    'اجلخ بداية كل خط لحام وحفرته إلى حافة مستدقة قبل الوصل عليهما؛ وابدأ كل تمريرة بعيداً عن مكان بداية التمريرة السابقة.',

  // ---- section and results ----------------------------------------------------------------------------
  'Inside bead (root side) h': 'ارتفاع الخرزة الداخلية (جهة الجذر) h',
  'Root not penetrated': 'جذر غير مخترق',
  'Keyhole kept on the root': 'الحفاظ على ثقب المفتاح في الجذر',
  'Keyhole kept open on the root (share of the root arc time)': 'الحفاظ على ثقب المفتاح مفتوحاً في الجذر (نسبة من زمن قوس الجذر)',

  // ---- about --------------------------------------------------------------------------------------------
  'Phase 1 prototype, release 1.5: GMAW (135), FCAW (136, 114), SMAW (111) and GTAW (141) on carbon steel: bead-on-plate drills, fillet and butt joints in PA–PG positions, open-root pipe in 1G, 2G, 5G and 6G (SMAW), live imperfections and code judging, technique exercises, and the Inspector and Tracking labs.':
    'نموذج المرحلة 1، الإصدار 1.5: لحام GMAW (135) وFCAW (136، 114) وSMAW (111) وGTAW (141) على الفولاذ الكربوني: تمارين خطوط على لوح، ووصلات زاوية وتناكبية في الوضعيات PA–PG، وأنابيب بجذر مفتوح في الأوضاع 1G و2G و5G و6G (SMAW)، وعيوب مباشرة وحكم وفق المواصفات، وتمارين تقنية، ومختبرا الفحص والتتبع.',
  'Release 1.5 adds pipe welding with covered electrodes: open-root butt joints on NPS 6 and NPS 2 pipe in the 1G, 2G, 5G and 6G test positions, the root and its inside bead, a keyhole cue, electrode angles that follow the position round the pipe, grinding of starts and craters, a pipe WPS from the Lincoln C2.420 procedure table (E6010 root, E7018 fill and cap) and six pipe drills.':
    'يضيف الإصدار 1.5 لحام الأنابيب بالإلكترودات المغلفة: وصلات تناكبية بجذر مفتوح على أنابيب NPS 6 وNPS 2 في أوضاع الاختبار 1G و2G و5G و6G، والجذر وخرزته الداخلية، وإرشاد ثقب المفتاح، وزوايا إلكترود تتبع الوضع حول الأنبوب، وجلخ البدايات والحفر، ومواصفة إجراء لحام للأنابيب من جدول إجراءات Lincoln C2.420 (جذر E6010، وحشو وغطاء E7018)، وستة تمارين للأنابيب.',

  // ---- pipe drills (B6) -------------------------------------------------------------------------------
  'Open root, 5G uphill (PH)': 'جذر مفتوح، 5G صاعد (PH)',
  'Open root, 5G downhill (PJ)': 'جذر مفتوح، 5G هابط (PJ)',
  'Root 5G up': 'جذر 5G صاعد',
  'Root 5G down': 'جذر 5G هابط',
  'NPS 2 Sch 80, root pass only (E6010)': 'NPS 2 Sch 80، تمريرة الجذر فقط (E6010)',
  'NPS 2 Sch 80, E6010 root + E7018 cap': 'NPS 2 Sch 80، جذر E6010 + غطاء E7018',
  'Pipe 1G': 'أنبوب 1G',
  'Pipe 2G': 'أنبوب 2G',
  'Pipe 5G': 'أنبوب 5G',
  'Pipe 6G': 'أنبوب 6G',
  'Pipe 1G: root and cap': 'أنبوب 1G: الجذر والغطاء',
  'Pipe 2G: root and cap': 'أنبوب 2G: الجذر والغطاء',
  'Pipe 5G uphill: root and cap': 'أنبوب 5G صاعد: الجذر والغطاء',
  'Pipe 6G uphill: root and cap': 'أنبوب 6G صاعد: الجذر والغطاء',
  'Pipe drills (scope B6): the open root uphill and downhill, then root and cap in the 1G, 2G, 5G and 6G test positions, with the pipe WPS electrode for each pass (E6010 root, E7018 cap).':
    'تمارين الأنابيب (النطاق B6): الجذر المفتوح صاعداً وهابطاً، ثم الجذر والغطاء في أوضاع الاختبار 1G و2G و5G و6G، بإلكترود مواصفة الإجراء لكل تمريرة (E6010 للجذر، E7018 للغطاء).',
  'Run the root of a fixed pipe from the bottom to the top, one side at a time, with a small keyhole the whole way: complete penetration on both lips and an inside bead with no burn-through.':
    'نفّذ جذر أنبوب ثابت من الأسفل إلى الأعلى، جانباً بعد جانب، مع ثقب مفتاح صغير طوال الطريق: اختراق كامل على الحافتين وخرزة داخلية دون اختراق زائد (حرق).',
  'Run the root of a fixed pipe from the top down each side, staying ahead of the pool: complete penetration on both lips and an inside bead with no burn-through.':
    'نفّذ جذر أنبوب ثابت من الأعلى إلى الأسفل على كل جانب، متقدماً على الحوض المنصهر: اختراق كامل على الحافتين وخرزة داخلية دون اختراق زائد (حرق).',
  'Weld the open root and the cap with the WPS electrode for each pass, cleaning between runs, keeping under the interpass limit, and meet ISO 5817 level C on the finished joint.':
    'الحم الجذر المفتوح والغطاء بإلكترود مواصفة الإجراء لكل تمريرة، مع التنظيف بين الخطوط والبقاء تحت حد درجة الحرارة بين التمريرات، وحقق المستوى C من ISO 5817 في الوصلة المكتملة.',
  "Check the fit-up: a 3.2 mm (1/8 in) gap all the way round, a 2.4 mm land, and the 12 o'clock mark on the pipe.":
    'تحقق من التجهيز: فجوة 3.2 مم (1/8 بوصة) على طول المحيط، ووجه جذر 2.4 مم، وعلامة الساعة 12 على الأنبوب.',
  "Strike just past 6 o'clock and weld up one side to just past 12 o'clock. Keep a small keyhole open at the root; if it closes the root is not penetrating. Push the electrode 5–10° up the joint on the sides, drag it slightly at the bottom and the top.":
    'أشعل القوس بعد الساعة 6 بقليل والحم صعوداً على جانب واحد حتى بعد الساعة 12 بقليل. حافظ على ثقب مفتاح صغير مفتوح عند الجذر؛ إذا انغلق فالجذر لا يخترق. ادفع الإلكترود 5–10° باتجاه أعلى الوصلة على الجانبين، واسحبه قليلاً في الأسفل والأعلى.',
  'Grind the start and the crater of the first side to a feathered edge before the other side runs onto them (C2.420).':
    'اجلخ بداية الجانب الأول وحفرته إلى حافة مستدقة قبل أن يصل إليهما الجانب الآخر (C2.420).',
  "Weld the other side from the bottom, over the first side's start, and finish over its crater at the top.":
    'الحم الجانب الآخر من الأسفل فوق بداية الجانب الأول، وأنهِ فوق حفرته في الأعلى.',
  'Change the electrode with a fast pull-out (a flick) to shrink the keyhole; restart ahead of the crater and move back into it.':
    'غيّر الإلكترود بسحب سريع (نقرة) لتصغير ثقب المفتاح؛ وأعد البدء أمام الحفرة ثم ارجع إليها.',
  "Strike just past 12 o'clock (not exactly at the top) and weld down one side, the electrode tipped 10–30° in the direction of travel. Travel fast enough to stay ahead of the pool.":
    'أشعل القوس بعد الساعة 12 بقليل (ليس في القمة تماماً) والحم نزولاً على جانب واحد، مع إمالة الإلكترود 10–30° في اتجاه التقدم. تقدّم بسرعة كافية لتبقى أمام الحوض المنصهر.',
  "Weld the other side from the top, over the first side's start, and finish over its crater just past 6 o'clock (stopping exactly at 6 o'clock invites burn-through, tie-in and suck-back problems: C2.420).":
    'الحم الجانب الآخر من الأعلى فوق بداية الجانب الأول، وأنهِ فوق حفرته بعد الساعة 6 بقليل (التوقف عند الساعة 6 تماماً يسبب مشكلات الحرق والوصل والتقعر الداخلي: C2.420).',
  'Weld on top of the pipe and roll it a quarter turn between runs (1G: the pipe is rolled during welding so that the weld metal is deposited from above: ASME IX QW-122). Keep a small keyhole on the root.':
    'الحم أعلى الأنبوب وأدره ربع دورة بين الخطوط (1G: يُدار الأنبوب أثناء اللحام بحيث يُرسَّب معدن اللحام من الأعلى: ASME IX QW-122). حافظ على ثقب مفتاح صغير في الجذر.',
  'Start each run in the crater of the last one; finish the last run over the start of the first.':
    'ابدأ كل خط في حفرة الخط السابق؛ وأنهِ الخط الأخير فوق بداية الخط الأول.',
  'Chip and brush the root. Cap with E7018: weave to just past both groove edges with a pause at each side, about 1.6 mm (1/16 in) higher than the pipe wall; start it away from where the root was started.':
    'أزل خبث الجذر بالمطرقة والفرشاة. الغطاء بإلكترود E7018: تذبذب حتى ما بعد حافتي الشطف بقليل مع توقف قصير عند كل جانب، وبارتفاع نحو 1.6 مم (1/16 بوصة) فوق جدار الأنبوب؛ وابدأه بعيداً عن مكان بداية الجذر.',
  "Pipe axis vertical: weld the root round the pipe in two halves the same way round; grind the first half's start and crater before the second half runs onto them.":
    'محور الأنبوب رأسي: الحم الجذر حول الأنبوب على نصفين في الاتجاه نفسه؛ واجلخ بداية النصف الأول وحفرته قبل أن يصل إليهما النصف الثاني.',
  'Cap: take care not to undercut the top of the weld; use the lower part of the current range and a short arc (C2.420).':
    'الغطاء: احذر من التآكل الجانبي في أعلى اللحام؛ استخدم الجزء الأدنى من نطاق التيار وقوساً قصيراً (C2.420).',
  "Root from the bottom to the top, one side at a time, with a small keyhole; grind the first side's start and crater before the second side.":
    'الجذر من الأسفل إلى الأعلى، جانباً بعد جانب، مع ثقب مفتاح صغير؛ واجلخ بداية الجانب الأول وحفرته قبل الجانب الثاني.',
  'Pipe fixed at 45°: the joint goes through the overhead, vertical and flat positions. Root uphill, one side at a time, with a small keyhole; keep the arc in the middle of the gap so both lips fuse.':
    'أنبوب ثابت بزاوية 45°: تمر الوصلة بالأوضاع العلوية والرأسية والمسطحة. الجذر صاعداً، جانباً بعد جانب، مع ثقب مفتاح صغير؛ وأبقِ القوس في منتصف الفجوة لتنصهر الحافتان.',
  'Cap: watch the upper toe; the weld metal tends to sag toward the lower pipe.':
    'الغطاء: راقب الحافة العليا؛ يميل معدن اللحام إلى الهبوط نحو الأنبوب السفلي.',
  'keyhole in window': 'ثقب المفتاح ضمن النطاق',
  'On the open root the travel speed is set by the keyhole: slower when it closes, faster when it grows (Lincoln C2.420).':
    'في الجذر المفتوح تُحدَّد سرعة التقدّم بثقب المفتاح: أبطأ عندما ينغلق، وأسرع عندما يكبر (Lincoln C2.420).',
};
