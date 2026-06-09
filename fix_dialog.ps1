$file = "F:\ard-al-mubarak-erp-96235b20\src\components\erp\AccountDialog.tsx"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# استبدال accountOverlay.create بـ Supabase
$old1 = @'
      accountOverlay.create({
        code: code.trim(),
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || null,
        type,
        is_active: isActive,
        meta: {
          is_posting: isPosting,
          vat_applicable: vatApplicable,
          cost_center_applicable: costCenterApplicable,
          notes: notes.trim() || undefined,
        },
      });
'@

$new1 = @'
      const parentSorted = accounts.filter(a => code.trim().startsWith(a.code) && a.code !== code.trim()).sort((a, b) => b.code.length - a.code.length)[0];
      const { error: insErr } = await supabase.from("accounts").insert({
        code: code.trim(),
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || null,
        type,
        nature: (type === "asset" || type === "expense") ? "debit" : "credit",
        is_posting: isPosting,
        is_vat: vatApplicable,
        cost_center: costCenterApplicable,
        is_archived: !isActive,
        notes: notes.trim() || null,
        level: code.length - 1,
        parent_id: parentSorted?.id ?? null,
      });
      if (insErr) { toast.error(insErr.message); return; }
'@

# استبدال accountOverlay.update بـ Supabase
$old2 = @'
      accountOverlay.update(target.id, {
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || null,
        is_active: isActive,
        meta: {
          is_posting: isPosting,
          vat_applicable: vatApplicable,
          cost_center_applicable: costCenterApplicable,
          notes: notes.trim() || undefined,
        },
      });
'@

$new2 = @'
      const { error: updErr } = await supabase.from("accounts").update({
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || null,
        is_archived: !isActive,
        is_posting: isPosting,
        is_vat: vatApplicable,
        cost_center: costCenterApplicable,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", target.id);
      if (updErr) { toast.error(updErr.message); return; }
'@

$content = $content.Replace($old1, $new1)
$content = $content.Replace($old2, $new2)
$content = $content.Replace("function submit()", "async function submit()")

[System.IO.File]::WriteAllText($file, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
