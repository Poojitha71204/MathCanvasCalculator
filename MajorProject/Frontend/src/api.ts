const API_URL = import.meta.env.VITE_API_URL;

export const solveMath = async (expression: string) => {
  const response = await fetch(`${API_URL}/solve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expression }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch result");
  }

  return response.json();
};
