/**
 * Health Vibe AI - Doctor UI Module
 * 
 * Manages clinical presets, queue item rendering, and doctor workspace panels.
 */

(function (global) {
  "use strict";

  function getDiagnosticPresets(isEn = false) {
    return {
      bronchitis: {
        diag: isEn
          ? "Acute bronchitis with mild bronchial irritation. Respiratory vitals monitored, no respiratory failure signs."
          : "التهاب شعبي حاد مع تهيج في الشعب الهوائية. تم فحص القياسات الحيوية ولا توجد مؤشرات على فشل تنفسي.",
        meds: isEn
          ? "1. Bronchodilator Inhaler (Salbutamol 100mcg) - 2 puffs every 6-8 hours as needed for dyspnea.\n2. Expectorant Cough Syrup (Guaifenesin 100mg/5ml) - 10ml three times daily after meals for 5 days.\n3. Paracetamol 500mg - 1-2 tablets every 6 hours if fever/body aches arise."
          : "1. بخاخ موسع للشعب الهوائية (سالبوتامول 100 ميكروجرام) - بختان كل 6-8 ساعات عند الشعور بضيق التنفس.\n2. شراب طارد ومذيب للبلغم (جوايفينيزين) - ملعقة كبيرة 3 مرات يومياً بعد الوجبات لمدة 5 أيام.\n3. باراسيتامول 500 مجم - قرص كل 6 ساعات عند ارتفاع الحرارة أو الصداع.",
        recs: isEn
          ? "• Drink warm fluids (herbal teas, honey-lemon) throughout the day.\n• Avoid sudden temperature changes, smoke, and air pollutants.\n• Rest voice and body for 48-72 hours.\n• Follow-up immediately if SpO2 drops below 92% or high fever persists."
          : "• تناول السوائل الدافئة بوفرة (عسل وليمون، مشروبات عشبية).\n• الابتعاد التام عن التدخين والغبار وتيارات الهواء البارد.\n• أخذ قسط وافر من الراحة البدنية لمدة 48-72 ساعة.\n• مراجعة الطوارئ فوراً في حال انخفاض نسبة الأكسجين عن 92% أو استمرار الحمى الشديدة."
      },
      stable: {
        diag: isEn
          ? "Normal respiratory assessment. Mild seasonal upper airway sensitivity without hypoxemia or respiratory distress."
          : "تقييم تنفسي طبيعي ومستقر. حساسية موسمية خفيفة في المجاري التنفسية العليا دون نقص بالأكسجين أو علامات خطورة.",
        meds: isEn
          ? "1. Antihistamine (Cetirizine 10mg) - 1 tablet once daily before bedtime for 7 days.\n2. Saline Nasal Spray - 2 sprays per nostril 3 times daily as needed."
          : "1. مضاد للهستامين (سيتريزين 10 مجم) - قرص واحد مساءً قبل النوم لمدة 7 أيام.\n2. بخاخ محلول ملحي للأنف - بختان في كل فتحة أنف 3 مرات يومياً عند الحاجة.",
        recs: isEn
          ? "• Stay well-hydrated and maintain good indoor ventilation.\n• Continue healthy dietary habits and adequate sleep.\n• Routine health checkup in 6 months or if symptoms worsen."
          : "• شرب كميات كافية من الماء والحفاظ على تهوية جيدة للمنزل.\n• الاستمرار في نمط حياة صحي وغذاء متوازن ونوم كافٍ.\n• مراجعة الفحص الدوري بعد 6 أشهر أو عند حدوث أي تغير في الأعراض."
      },
      asthma: {
        diag: isEn
          ? "Mild-to-moderate bronchial asthma flare-up. Reactive airway, SpO2 borderline stable."
          : "نوبة ربو شعبي متوسطة إلى خفيفة. وجود صفير بالصدر مع تهيج بالشعب الهوائية مع استقرار نسبي لنسبة الأكسجين.",
        meds: isEn
          ? "1. Combination Inhaler (Budesonide/Formoterol 160/4.5mcg) - 1-2 inhalations twice daily.\n2. Oral Prednisolone 20mg - 1 tablet in the morning after breakfast for 3 days.\n3. Salbutamol Inhaler - 2 puffs as rescue therapy for acute shortness of breath."
          : "1. بخاخ مدمج (بوديزونايد / فورموتيرول) - استنشاقة واحدة مرتين يومياً صباحاً ومساءً.\n2. بريدنيزولون 20 مجم - قرص واحد صباحاً بعد الإفطار لمدة 3 أيام فقط.\n3. بخاخ سالبوتامول - بختان للإنقاذ عند الشعور بضيق مفاجئ في التنفس.",
        recs: isEn
          ? "• Keep rescue inhaler readily accessible at all times.\n• Avoid known allergy triggers (perfumes, cat/dog dander, dust mites).\n• Measure peak flow or SpO2 twice daily.\n• Visit ER immediately if no improvement after 3 rescue doses within 1 hour."
          : "• الاحتفاظ ببخاخ الإنقاذ في متناول اليد في جميع الأوقات.\n• تجنب المهيجات المسببة للحساسية (العطور القوية، فراء الحيوانات، الغبار).\n• قياس نسبة الأكسجين SpO2 مرتين يومياً.\n• التوجه فوراً لقسم الطوارئ في حال عدم الاستجابة لثلاث جرعات إسعافية خلال ساعة."
      },
      uri: {
        diag: isEn
          ? "Acute viral upper respiratory tract infection (URTI) with rhinitis and productive cough. No lower respiratory consolidation."
          : "التهاب فيروسي حاد بالجهاز التنفسي العلوي مصحوب بسيلان أنفي وسعال. لا توجد مؤشرات على التهاب رئوي سفلي.",
        meds: isEn
          ? "1. Vitamin C + Zinc Lozenges - twice daily for 5 days.\n2. Decongestant / Antihistamine combo - 1 tablet twice daily after meals for 4 days.\n3. Paracetamol 500mg - every 6-8 hours for sore throat or fever."
          : "1. مكمل فيتامين سي مع زنك - مرتين يومياً لمدة 5 أيام.\n2. أقراص مزيلة للاحتقان ومضادة للهستامين - قرص مرتين يومياً بعد الأكل لمدة 4 أيام.\n3. باراسيتامول 500 مجم - قرص كل 6 إلى 8 ساعات لتسكين آلام الحلق والحمى.",
        recs: isEn
          ? "• Strict rest and sleep to boost immune recovery.\n• Frequent warm saline gargles 3-4 times daily.\n• Wear a mask around vulnerable family members.\n• Follow-up in 3-5 days if symptoms fail to resolve."
          : "• الراحة التامة والنوم الكافي لتعزيز مناعة الجسم.\n• الغرغرة بمحلول ملحي دافئ 3-4 مرات يومياً لتخفيف احتقان الحلق.\n• ارتداء كمامة واقية عند التعامل مع كبار السن أو الأطفال.\n• مراجعة الطبيب إذا استمرت الأعراض لأكثر من 5 أيام دون تحسن."
      }
    };
  }

  const DoctorUI = {
    getDiagnosticPresets
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorUI = DoctorUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
