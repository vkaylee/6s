import { fetchAuthenticatedBlob } from "../../api/client.ts";

export async function downloadReportsXlsx(locationCode?: string): Promise<void> {
  const query = locationCode
    ? `?${new URLSearchParams({ location_code: locationCode }).toString()}`
    : "";
  const blob = await fetchAuthenticatedBlob(`/api/issues/export${query}`);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `6S_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
