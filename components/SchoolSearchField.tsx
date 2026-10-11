import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import {
  QUICK_SCHOOL_REGIONS,
  canonicalizeAdminRegion,
  searchAdminRegions,
} from '../constants/adminRegions';
import { formatSchoolShortName } from '../lib/schoolTeam';

interface OfficialSchool {
  id: string;
  region: string;
  name: string;
  formatted: string;
  canonicalRegion: string | null;
}

interface SchoolSearchFieldProps {
  schoolName: string;
  schoolRegion: string;
  onChangeSchoolName: (name: string) => void;
  onChangeSchoolRegion: (region: string) => void;
}

export default function SchoolSearchField({
  schoolName,
  schoolRegion,
  onChangeSchoolName,
  onChangeSchoolRegion,
}: SchoolSearchFieldProps) {
  const [schools, setSchools] = useState<OfficialSchool[]>([]);
  const [schoolHits, setSchoolHits] = useState<OfficialSchool[]>([]);
  const [showSchools, setShowSchools] = useState(false);
  const [regionQuery, setRegionQuery] = useState('');
  const [regionHits, setRegionHits] = useState<string[]>([]);
  const [showRegions, setShowRegions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('official_schools').select('id, region, name').eq('is_active', true);
      if (cancelled || !data) return;
      setSchools(data.map((row) => ({
        id: String(row.id),
        region: String(row.region || ''),
        name: String(row.name || ''),
        formatted: formatSchoolShortName(String(row.name || '')),
        canonicalRegion: canonicalizeAdminRegion(row.region),
      })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSchoolText = (text: string) => {
    onChangeSchoolName(text);
    onChangeSchoolRegion('');
    const q = text.trim();
    if (q.length < 1) {
      setShowSchools(false);
      setSchoolHits([]);
      return;
    }
    const hits = schools
      .filter((row) => row.formatted.includes(q) || row.name.includes(q))
      .slice(0, 30);
    setSchoolHits(hits);
    setShowSchools(hits.length > 0);
  };

  const selectSchool = (school: OfficialSchool) => {
    onChangeSchoolName(school.formatted);
    if (school.canonicalRegion) onChangeSchoolRegion(school.canonicalRegion);
    setShowSchools(false);
    setRegionQuery('');
    setShowRegions(false);
  };

  const onRegionText = (text: string) => {
    setRegionQuery(text);
    const hits = searchAdminRegions(text);
    setRegionHits(hits);
    setShowRegions(text.trim().length > 0);
  };

  const selectRegion = (label: string) => {
    onChangeSchoolRegion(label);
    setRegionQuery('');
    setShowRegions(false);
  };

  return (
    <View>
      <Text style={styles.help}>
        같은 이름의 학교를 구분하려고 학교명과 실제 소재지(시/도 + 시/군/구)를 함께 고릅니다.
      </Text>

      <Text style={styles.label}>학교명</Text>
      <View style={styles.anchor}>
        <TextInput
          style={styles.input}
          value={schoolName}
          onChangeText={onSchoolText}
          placeholder="예: 삼은초, 불당초등학교"
          placeholderTextColor="#94A3B8"
        />
        {showSchools && (
          <View style={styles.dropdown}>
            <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {schoolHits.map((school) => (
                <TouchableOpacity key={school.id} style={styles.dropdownItem} onPress={() => selectSchool(school)}>
                  <Text style={styles.dropdownTitle} numberOfLines={1}>🏫 {school.formatted}</Text>
                  <Text style={styles.dropdownBadge}>{school.canonicalRegion || school.region || '지역 확인'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <Text style={[styles.label, { marginTop: 14 }]}>학교 소재 행정구역</Text>
      {schoolRegion ? (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedText}>{schoolName || '학교'} · {schoolRegion}</Text>
          <TouchableOpacity onPress={() => onChangeSchoolRegion('')} hitSlop={8}>
            <Text style={styles.clearText}>변경</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.emptyText}>아직 행정구역이 선택되지 않았습니다.</Text>
      )}

      <View style={[styles.anchor, { marginTop: 8 }]}>
        <TextInput
          style={styles.input}
          value={regionQuery}
          onChangeText={onRegionText}
          placeholder="행정구역 검색 (예: 아산, 서울 강남구)"
          placeholderTextColor="#94A3B8"
        />
        {showRegions && (
          <View style={styles.dropdown}>
            <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {regionHits.length === 0 ? (
                <View style={styles.dropdownItem}>
                  <Text style={styles.emptyText}>일치하는 행정구역이 없습니다.</Text>
                </View>
              ) : regionHits.map((label) => (
                <TouchableOpacity key={label} style={styles.dropdownItem} onPress={() => selectRegion(label)}>
                  <Text style={styles.dropdownTitle} numberOfLines={1}>📍 {label}</Text>
                  <Text style={styles.dropdownBadge}>선택</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <Text style={styles.quickLabel}>자주 쓰는 지역</Text>
      <View style={styles.quickRow}>
        {QUICK_SCHOOL_REGIONS.map((label) => {
          const selected = schoolRegion === label;
          return (
            <TouchableOpacity
              key={label}
              style={[styles.quickChip, selected && styles.quickChipOn]}
              onPress={() => selectRegion(label)}
            >
              <Text style={[styles.quickChipText, selected && styles.quickChipTextOn]}>
                {selected ? '✓ ' : ''}{label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 12, color: '#1E3A8A', lineHeight: 18, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: Colors.text,
  },
  anchor: { zIndex: 20 },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    marginTop: 4,
    zIndex: 30,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A', marginRight: 8 },
  dropdownBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#1E40AF', marginRight: 8 },
  clearText: { fontSize: 12, fontWeight: '800', color: '#DC2626' },
  emptyText: { fontSize: 12, color: '#94A3B8' },
  quickLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 10, marginBottom: 6 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickChipOn: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  quickChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  quickChipTextOn: { color: '#FFFFFF', fontWeight: '800' },
});
