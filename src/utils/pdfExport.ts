import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportPageToPDF(filename: string = "document.pdf") {
  const element = document.getElementById("print-content") ?? document.querySelector(".doc-print-host") as HTMLElement;
  if (!element) { alert("لا يوجد محتوى للتصدير"); return; }
  
  // إخفاء العناصر غير المراد طباعتها
  const hidden: HTMLElement[] = [];
  document.querySelectorAll(".no-print").forEach(el => {
    (el as HTMLElement).style.visibility = "hidden";
    hidden.push(el as HTMLElement);
  });

  try {
    const canvas = await html2canvas(element, {
      scale: 2, useCORS: true, allowTaint: true,
      backgroundColor: "#ffffff", logging: false,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(filename);
  } catch (error) {
    console.error("PDF export error:", error);
    alert("حدث خطأ أثناء تصدير PDF");
  } finally {
    hidden.forEach(el => el.style.visibility = "");
  }
}
